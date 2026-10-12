import { AppProvider } from "@/renderer/components/ui/provider";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionSwitcher } from "./parts/QuestionSwitcher";
import {
  type UserInputFormDetails,
  UserInputForm,
  useUserInputFormController,
} from "./userInputForm";

const details: UserInputFormDetails = {
  responseShape: "answers-map",
  questions: [
    {
      id: "color",
      header: "Color",
      question: "Which color?",
      isSecret: false,
      multiSelect: false,
      options: [
        { optionId: "blue", label: "Blue" },
        { optionId: "green", label: "Green" },
      ],
    },
    {
      id: "notes",
      header: "Notes",
      question: "Any notes?",
      isSecret: false,
      multiSelect: false,
      options: null,
    },
  ],
};

describe("useUserInputFormController.allAnswered", () => {
  it("starts false when questions are unanswered", () => {
    const { result } = renderHook(() => useUserInputFormController(details));
    expect(result.current?.allAnswered).toBe(false);
  });

  it("requires every question, not just the visible one", () => {
    const { result } = renderHook(() => useUserInputFormController(details));
    act(() => result.current?.selectSingleChoice("color", "blue"));
    expect(result.current?.allAnswered).toBe(false);
    act(() => result.current?.setDirectAnswer("notes", "looks good"));
    expect(result.current?.allAnswered).toBe(true);
  });

  it("treats whitespace-only text as unanswered", () => {
    const { result } = renderHook(() => useUserInputFormController(details));
    act(() => result.current?.selectSingleChoice("color", "blue"));
    act(() => result.current?.setDirectAnswer("notes", "   "));
    expect(result.current?.allAnswered).toBe(false);
    act(() => result.current?.setDirectAnswer("notes", "real note"));
    expect(result.current?.allAnswered).toBe(true);
  });
});

describe("UserInputForm submission guard", () => {
  it("refuses native form submission until every answer is nonblank", () => {
    const onSubmit = vi.fn<(response: unknown, outcome: string) => void>();
    function Form() {
      const controller = useUserInputFormController(details);
      return (
        <UserInputForm
          formId="guarded-question"
          controller={controller!}
          isDisabled={false}
          onSubmit={onSubmit}
        />
      );
    }
    const { container, getByRole } = render(
      <AppProvider>
        <Form />
      </AppProvider>,
    );
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(getByRole("option", { name: /Blue/ }));
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(getByRole("textbox"), { target: { value: "   " } });
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(getByRole("textbox"), { target: { value: "Verified answer" } });
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { answers: { color: "blue", notes: "Verified answer" } },
      "answered",
    );
  });
});

describe("UserInputForm step keyboard navigation", () => {
  function renderQuestions(formDetails: UserInputFormDetails, isDisabled = false) {
    const onSubmit = vi.fn<(response: unknown, outcome: string) => void>();
    function Form() {
      const controller = useUserInputFormController(formDetails)!;
      return (
        <>
          <QuestionSwitcher
            questions={controller.questions}
            answers={controller.answers}
            customAnswers={controller.customAnswers}
            activeIndex={controller.activeIndex}
            isDisabled={isDisabled}
            onSelect={controller.setActiveIndex}
          />
          <UserInputForm
            formId="keyboard-questions"
            controller={controller}
            isDisabled={isDisabled}
            onSubmit={onSubmit}
          />
        </>
      );
    }
    return {
      ...render(
        <AppProvider>
          <Form />
        </AppProvider>,
      ),
      onSubmit,
    };
  }

  it("Enter on a custom answer advances, then only the final step submits", () => {
    const { getByRole, onSubmit } = renderQuestions(details);
    const custom = getByRole("textbox");
    fireEvent.keyDown(custom, { key: "Enter" });
    expect(getByRole("option", { name: /Blue/ })).toBeDefined();
    fireEvent.change(custom, { target: { value: "Purple" } });
    fireEvent.keyDown(custom, { key: "Enter", shiftKey: true });
    expect(getByRole("option", { name: /Blue/ })).toBeDefined();
    fireEvent.keyDown(custom, { key: "Enter" });
    const notes = getByRole("textbox");
    expect(notes.tagName).toBe("TEXTAREA");
    expect(document.activeElement).toBe(notes);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(notes, { target: { value: "Ready" } });
    fireEvent.click(getByRole("tab", { name: /Color/ }));
    fireEvent.submit(document.querySelector("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(getByRole("textbox"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { answers: { color: "Purple", notes: "Ready" } },
      "answered",
    );
  });

  it.each(["answers-map", "codex-request-user-input"] as const)(
    "Enter selects the final option before building a %s reply",
    (responseShape) => {
      const formDetails = {
        ...details,
        responseShape,
        questions: [
          details.questions[0]!,
          {
            ...details.questions[1]!,
            options: [
              { optionId: "approved", label: "Approved" },
              { optionId: "revise", label: "Revise" },
            ],
          },
        ],
      };
      const { getByRole, onSubmit } = renderQuestions(formDetails);
      fireEvent.keyDown(getByRole("option", { name: /Blue/ }), { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(getByRole("option", { name: /Approved/ }));
      fireEvent.change(getByRole("textbox"), { target: { value: "Old custom answer" } });
      fireEvent.keyDown(getByRole("option", { name: /Revise/ }), { key: "Enter" });
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
        responseShape === "answers-map"
          ? { answers: { color: "blue", notes: "revise" } }
          : { answers: { color: { answers: ["blue"] }, notes: { answers: ["revise"] } } },
        "answered",
      );
    },
  );

  it("arrows navigate without selecting, and number shortcuts select and advance", () => {
    const formDetails = {
      ...details,
      questions: [
        details.questions[0]!,
        {
          ...details.questions[1]!,
          options: [
            { optionId: "ready", label: "Ready" },
            { optionId: "revise", label: "Revise" },
          ],
        },
      ],
    };
    const { getByRole, onSubmit } = renderQuestions(formDetails);
    const blue = getByRole("option", { name: /Blue/ });
    const green = getByRole("option", { name: /Green/ });
    blue.focus();
    fireEvent.keyDown(blue, { key: "ArrowUp" });
    expect(document.activeElement).toBe(green);
    expect(green.getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(green, { key: "ArrowDown" });
    expect(document.activeElement).toBe(blue);
    fireEvent.keyDown(blue, { key: "2" });
    expect(getByRole("tab", { name: /Notes/ }).getAttribute("aria-selected")).toBe("true");
    const ready = getByRole("option", { name: /Ready/ });
    fireEvent.keyDown(ready, { key: "2", repeat: true });
    expect(getByRole("option", { name: /Revise/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(ready, { key: "1" });
    expect(ready.getAttribute("aria-selected")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(ready, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { answers: { color: "green", notes: "ready" } },
      "answered",
    );
  });

  it("number shortcuts toggle multi-select answers without advancing", () => {
    const formDetails = {
      ...details,
      questions: [{ ...details.questions[0]!, multiSelect: true }, details.questions[1]!],
    };
    const { getByRole, onSubmit } = renderQuestions(formDetails);
    const blue = getByRole("option", { name: /Blue/ });
    const green = getByRole("option", { name: /Green/ });
    fireEvent.keyDown(blue, { key: "1" });
    fireEvent.keyDown(blue, { key: "2" });
    expect(blue.getAttribute("aria-selected")).toBe("true");
    expect(green.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(green, { key: "1" });
    expect(blue.getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Color/ }).getAttribute("aria-selected")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves typed answers, modifiers, composition, and missing shortcuts alone", () => {
    const { getByRole } = renderQuestions(details);
    const input = getByRole("textbox");
    for (const key of ["1", "ArrowUp", "ArrowDown"]) fireEvent.keyDown(input, { key });
    const blue = getByRole("option", { name: /Blue/ });
    for (const extra of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
      { keyCode: 229 },
    ])
      fireEvent.keyDown(blue, { key: "2", ...extra });
    fireEvent.keyDown(blue, { key: "9" });
    expect(getByRole("tab", { name: /Color/ }).getAttribute("aria-selected")).toBe("true");
    expect(blue.getAttribute("aria-selected")).toBe("false");
    fireEvent.change(input, { target: { value: "123" } });
    expect((input as HTMLInputElement).value).toBe("123");
  });

  it("ignores Enter while answer resolution is disabled", () => {
    const { getByRole, onSubmit } = renderQuestions(details, true);
    const blue = getByRole("option", { name: /Blue/ });
    fireEvent.keyDown(blue, { key: "Enter" });
    fireEvent.keyDown(blue, { key: "2" });
    fireEvent.keyDown(blue, { key: "ArrowDown" });
    expect(getByRole("tab", { name: /Color/ }).getAttribute("aria-selected")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
