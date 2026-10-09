import { AppProvider } from "@/renderer/components/ui/provider";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
