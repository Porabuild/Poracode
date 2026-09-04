import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type UserInputFormDetails, useUserInputFormController } from "./userInputForm";

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
