import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME_SPECS } from "../src/renderer/theme/themePresets";
import { SUPPORTED_LOCALES } from "../src/shared/locale";
import { parsePoMessages } from "./generate-main-promotion-messages.mjs";

const messages = [
  "Custom theme",
  "Create custom theme",
  "Import theme",
  "Edit theme",
  "Delete theme",
  "My theme",
  "Theme name",
  "Palette mode",
  "Light",
  "Dark",
  "Background",
  "Surface",
  "Text color",
  "Accent",
  "Text on accent",
  "Border",
  "Sidebar background",
  "Content background",
  "Composer background",
  "Selected sidebar row",
  "Use sidebar background for the docked sidebar",
  "Use #rgb or #rrggbb colors. Leave optional colors blank to derive them automatically.",
  "Text contrast",
  "Low contrast",
  "Good contrast",
  "Secondary text",
  "— means an automatic fill or an invalid color.",
  "Ratios for opaque theme surfaces. Aim for at least 4.5:1 for text.",
  "Enter a theme name and valid hex colors in both palettes.",
  "The custom theme limit has been reached. Delete a theme before adding another.",
  "Could not import this theme. Use a version 1 theme JSON file under 32 KB with a name and valid light and dark palettes.",
  "Delete this custom theme? If it is active, Poracode will use the default theme.",
  "Export theme",
  "Save and apply",
  "Cancel",
  "Close",
  "Delete",
  "Automatic",
];

// Native-only storage failures have no PWA equivalent: its store normalizes
// records in shared settings. Keep their translations here beside the generator.
const nativeMessages: Record<string, Record<string, string>> = {
  "Saved themes could not be read. Existing data has been kept.": {
    en: "Saved themes could not be read. Existing data has been kept.",
    es: "No se pudieron leer los temas guardados. Se han conservado los datos existentes.",
    ru: "Не удалось прочитать сохранённые темы. Существующие данные сохранены.",
    uk: "Не вдалося прочитати збережені теми. Наявні дані збережено.",
    "zh-CN": "无法读取已保存的主题。现有数据已保留。",
    ja: "保存されたテーマを読み込めませんでした。既存のデータは保持されています。",
    "pt-BR": "Não foi possível ler os temas salvos. Os dados existentes foram preservados.",
    de: "Gespeicherte Designs konnten nicht gelesen werden. Vorhandene Daten wurden beibehalten.",
    fr: "Impossible de lire les thèmes enregistrés. Les données existantes ont été conservées.",
    ko: "저장된 테마를 읽을 수 없습니다. 기존 데이터는 보존되었습니다.",
    pl: "Nie można odczytać zapisanych motywów. Dotychczasowe dane zostały zachowane.",
    vi: "Không thể đọc các giao diện đã lưu. Dữ liệu hiện có đã được giữ lại.",
    tr: "Kaydedilen temalar okunamadı. Mevcut veriler korundu.",
  },
  "Update Poracode to edit themes saved by a newer version.": {
    en: "Update Poracode to edit themes saved by a newer version.",
    es: "Actualiza Poracode para editar temas guardados por una versión más reciente.",
    ru: "Обновите Poracode, чтобы редактировать темы, сохранённые более новой версией.",
    uk: "Оновіть Poracode, щоб редагувати теми, збережені новішою версією.",
    "zh-CN": "请更新 Poracode，以编辑由较新版本保存的主题。",
    ja: "新しいバージョンで保存されたテーマを編集するには、Poracodeをアップデートしてください。",
    "pt-BR": "Atualize o Poracode para editar temas salvos por uma versão mais recente.",
    de: "Aktualisiere Poracode, um Designs aus einer neueren Version zu bearbeiten.",
    fr: "Mettez Poracode à jour pour modifier les thèmes enregistrés par une version plus récente.",
    ko: "새 버전에서 저장한 테마를 편집하려면 Poracode를 업데이트하세요.",
    pl: "Zaktualizuj Poracode, aby edytować motywy zapisane w nowszej wersji.",
    vi: "Cập nhật Poracode để chỉnh sửa giao diện được lưu bằng phiên bản mới hơn.",
    tr: "Daha yeni bir sürümde kaydedilen temaları düzenlemek için Poracode'u güncelleyin.",
  },
};

const catalogs = new Map(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    parsePoMessages(readFileSync(`src/renderer/locales/${locale}/messages.po`, "utf8"), locale),
  ]),
);
const all = [...messages, ...Object.keys(nativeMessages)];
const strings = Object.fromEntries(
  all.map((message) => [
    message,
    {
      extractionState: "manual",
      localizations: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => {
          const translated =
            nativeMessages[message]?.[locale] ?? catalogs.get(locale)?.get(message);
          if (!translated?.trim())
            throw new Error(`Missing native theme translation ${locale}: ${message}`);
          return [
            locale === "zh-CN" ? "zh-Hans" : locale,
            { stringUnit: { state: "translated", value: translated } },
          ];
        }),
      ),
    },
  ]),
);
const files = {
  "CustomThemeCatalog.json":
    JSON.stringify(
      {
        formatVersion: 1,
        presets: THEME_SPECS.map((spec) => ({
          id: spec.id,
          document: { version: 1, label: spec.label, light: spec.light, dark: spec.dark },
        })),
      },
      null,
      2,
    ) + "\n",
  "CustomThemes.xcstrings":
    JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" }, null, 2) + "\n",
};
const outputArgument = process.argv.indexOf("--output-directory");
const directory = resolve(
  outputArgument >= 0 ? process.argv[outputArgument + 1]! : "ios/App/App/Features/CustomThemes",
);
for (const [name, content] of Object.entries(files)) {
  const path = resolve(directory, name);
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content)
      throw new Error(`Stale native theme resource ${name}`);
  } else {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, content);
  }
}
console.log(
  `Native custom theme resources ${process.argv.includes("--check") ? "are current" : "generated"}.`,
);
