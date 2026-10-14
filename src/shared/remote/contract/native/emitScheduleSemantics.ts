import { SCHEDULE_TIME_ZONES } from "../../../scheduleTimeZones";

const zoneKeys = Object.keys(SCHEDULE_TIME_ZONES);
/** Portable equivalents of the schedule contract's custom refinements. */
export const SWIFT_SCHEDULE_CASES = String.raw`
    case "schedule.automation":
      let mode = object(item?["mode"] ?? .null); let completion = object(item?["completionPolicy"] ?? .null); let retry = object(item?["retryPolicy"] ?? .null)
      if string(mode?["kind"]) != "heartbeat" && string(completion?["kind"]) != "none" { try fail(id, path) }
      if string(retry?["kind"]) == "exponential", let maximum = int(retry?["maxDelaySeconds"]), let initial = int(retry?["initialDelaySeconds"]), maximum < initial { try fail(id, path) }
    case "schedule.run-state": if item?["unread"] == nil && item?["archived"] == nil { try fail(id, path) }
    case "schedule.time-zone": guard let zone = string(value), validScheduleTimeZone(zone) else { try fail(id, path) }
    case "schedule.cron": guard let expression = string(value), validScheduleCron(expression) else { try fail(id, path) }
`;

export const SWIFT_SCHEDULE_HELPERS =
  `
  private static let scheduleTimeZones: Set<String> = [${zoneKeys.map((zone) => JSON.stringify(zone)).join(", ")}]
  private static func validScheduleTimeZone(_ zone: String) -> Bool {
    scheduleTimeZones.contains(zone.lowercased()) || zone.range(of: "^[+-](?:[01][0-9]|2[0-3])(?::?[0-5][0-9])?$", options: .regularExpression) != nil
  }
` +
  String.raw`
  private static func validScheduleCron(_ expression: String) -> Bool {
    let spaces: Set<UInt32> = [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279]
    let fields = expression.split(whereSeparator: { $0.unicodeScalars.allSatisfy { spaces.contains($0.value) } })
    let bounds = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    guard fields.count == bounds.count else { return false }
    return zip(fields, bounds).allSatisfy { field, bound in
      field.split(separator: ",", omittingEmptySubsequences: false).allSatisfy { part in
        let segments = part.split(separator: "/", omittingEmptySubsequences: false)
        guard (1...2).contains(segments.count), !segments[0].isEmpty else { return false }
        if segments.count == 2 { guard segments[1].allSatisfy({ $0.isASCII && $0.isNumber }), let step = Int(segments[1]), step >= 1, step <= bound.1 - bound.0 + 1 else { return false } }
        if segments[0] == "*" { return true }
        let range = segments[0].split(separator: "-", omittingEmptySubsequences: false)
        guard (1...2).contains(range.count), range.allSatisfy({ !$0.isEmpty && $0.allSatisfy { $0.isASCII && $0.isNumber } }), let start = Int(range[0]), let end = Int(range.last!) else { return false }
        return start >= bound.0 && start <= bound.1 && end >= start && end <= bound.1
      }
    }
  }
`;

export const KOTLIN_SCHEDULE_CASES = String.raw`
        "schedule.automation" -> {
            val mode = obj(item?.get("mode")); val completion = obj(item?.get("completionPolicy")); val retry = obj(item?.get("retryPolicy"))
            if (str(mode?.get("kind")) != "heartbeat" && str(completion?.get("kind")) != "none") fail(id, path)
            if (str(retry?.get("kind")) == "exponential" && (long(retry?.get("maxDelaySeconds")) ?: 0) < (long(retry?.get("initialDelaySeconds")) ?: 0)) fail(id, path)
        }
        "schedule.run-state" -> if (!has("unread") && !has("archived")) fail(id, path)
        "schedule.time-zone" -> if (str(value)?.let(::validScheduleTimeZone) != true) fail(id, path)
        "schedule.cron" -> if (str(value)?.let(::validScheduleCron) != true) fail(id, path)
`;

export const KOTLIN_SCHEDULE_HELPERS =
  `
    private val scheduleTimeZones = setOf(${zoneKeys.map((zone) => JSON.stringify(zone)).join(", ")})
    private val scheduleTimeZoneOffset = Regex("^[+-](?:[01][0-9]|2[0-3])(?::?[0-5][0-9])?$")
    private fun validScheduleTimeZone(zone: String): Boolean = zone.lowercase(java.util.Locale.ROOT) in scheduleTimeZones || scheduleTimeZoneOffset.matches(zone)
` +
  String.raw`
    private fun validScheduleCron(expression: String): Boolean {
        val spaces = setOf(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)
        val normalized = expression.map { if (it.code in spaces) ' ' else it }.joinToString("")
        val fields = normalized.split(' ').filter(String::isNotEmpty)
        val bounds = listOf(0 to 59, 0 to 23, 1 to 31, 1 to 12, 0 to 7)
        if (fields.size != bounds.size) return false
        return fields.zip(bounds).all { (field, bound) ->
            field.split(',').all { part ->
                val segments = part.split('/')
                if (segments.size !in 1..2 || segments[0].isEmpty()) return@all false
                if (segments.size == 2) { val step = segments[1].takeIf { it.all { c -> c in '0'..'9' } }?.toIntOrNull(); if (step == null || step < 1 || step > bound.second - bound.first + 1) return@all false }
                if (segments[0] == "*") return@all true
                val range = segments[0].split('-')
                if (range.size !in 1..2 || range.any { it.isEmpty() || it.any { c -> c !in '0'..'9' } }) return@all false
                val start = range[0].toIntOrNull() ?: return@all false
                val end = range.last().toIntOrNull() ?: return@all false
                start >= bound.first && start <= bound.second && end >= start && end <= bound.second
            }
        }
    }
`;
