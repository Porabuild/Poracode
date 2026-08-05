"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

// Global error boundary, rendered when the root layout itself fails. It
// replaces the whole document, so it must render its own <html>/<body> and
// cannot rely on globals.css, next/font, or the I18nProvider — everything
// below is inline and detects the locale from the URL prefix instead.
// `retry()` (stable since Next.js 16.3) re-fetches and re-renders the failed
// segment, including its Server Components, so transient server errors recover
// without a full reload.

type ErrorCopy = {
  title: string;
  description: string;
  tryAgain: string;
};

// Keep this copy local to the emergency boundary. Importing the main message
// table would put every marketing-site translation in the global-error chunk.
const ERROR_COPY = {
  en: {
    title: "Something went wrong",
    description: "An unexpected error occurred while rendering this page.",
    tryAgain: "Try again",
  },
  es: {
    title: "Algo salió mal",
    description: "Se produjo un error inesperado al mostrar esta página.",
    tryAgain: "Inténtalo de nuevo",
  },
  fr: {
    title: "Une erreur s'est produite",
    description: "Une erreur inattendue s'est produite lors de l'affichage de cette page.",
    tryAgain: "Réessayer",
  },
  de: {
    title: "Etwas ist schiefgelaufen",
    description: "Beim Anzeigen dieser Seite ist ein unerwarteter Fehler aufgetreten.",
    tryAgain: "Erneut versuchen",
  },
  "pt-BR": {
    title: "Algo deu errado",
    description: "Ocorreu um erro inesperado ao exibir esta página.",
    tryAgain: "Tentar novamente",
  },
  ru: {
    title: "Что-то пошло не так",
    description: "При отображении этой страницы произошла непредвиденная ошибка.",
    tryAgain: "Повторить попытку",
  },
  uk: {
    title: "Щось пішло не так",
    description: "Під час відображення цієї сторінки сталася неочікувана помилка.",
    tryAgain: "Спробувати ще раз",
  },
  pl: {
    title: "Coś poszło nie tak",
    description: "Wystąpił nieoczekiwany błąd podczas wyświetlania tej strony.",
    tryAgain: "Spróbuj ponownie",
  },
  tr: {
    title: "Bir şeyler ters gitti",
    description: "Bu sayfa görüntülenirken beklenmeyen bir hata oluştu.",
    tryAgain: "Tekrar dene",
  },
  vi: {
    title: "Đã xảy ra lỗi",
    description: "Đã xảy ra lỗi không mong muốn khi hiển thị trang này.",
    tryAgain: "Thử lại",
  },
  ja: {
    title: "問題が発生しました",
    description: "このページの表示中に予期しないエラーが発生しました。",
    tryAgain: "再試行",
  },
  ko: {
    title: "문제가 발생했습니다",
    description: "이 페이지를 표시하는 중 예기치 않은 오류가 발생했습니다.",
    tryAgain: "다시 시도",
  },
  "zh-CN": {
    title: "出现错误",
    description: "显示此页面时发生意外错误。",
    tryAgain: "重试",
  },
} satisfies Record<Locale, ErrorCopy>;

function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const segment = window.location.pathname.split("/")[1];
  return isLocale(segment) ? segment : DEFAULT_LOCALE;
}

function getDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  return typeof error.digest === "string" ? error.digest : undefined;
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const copy = ERROR_COPY[locale];
  const digest = getDigest(error);

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <title>{copy.title}</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070709",
          color: "#eaf0fb",
          fontFamily: '"Geist", "Inter", system-ui, -apple-system, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <main style={{ maxWidth: "28rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>{copy.title}</h1>
          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#9ba6be",
            }}
          >
            {copy.description}
          </p>
          {digest ? (
            <p
              style={{
                margin: "0.75rem 0 0",
                fontSize: "0.75rem",
                color: "#9ba6be",
                fontFamily: 'ui-monospace, "Geist Mono", monospace',
              }}
            >
              {digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "#070709",
              background: "#8b7bff",
              border: "none",
              borderRadius: "9999px",
              cursor: "pointer",
            }}
          >
            {copy.tryAgain}
          </button>
        </main>
      </body>
    </html>
  );
}
