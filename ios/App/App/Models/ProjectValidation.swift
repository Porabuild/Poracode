import Foundation

enum ProjectNameValidationError: Equatable, Sendable {
    case empty
    case reservedDotName
    case illegalCharacter
    case tooLong
}

enum ProjectValidation {
    private static let safeCloneSchemes: Set<String> = [
        "https", "http", "ssh", "git", "ftp", "ftps",
    ]

    /// ECMAScript `String.prototype.trim` whitespace, including BOM (U+FEFF).
    static func jsTrim(_ value: String) -> String {
        let scalars = value.unicodeScalars
        var start = scalars.startIndex
        var end = scalars.endIndex
        while start < end, isJSTrimScalar(scalars[start].value) {
            start = scalars.index(after: start)
        }
        while start < end {
            let previous = scalars.index(before: end)
            guard isJSTrimScalar(scalars[previous].value) else { break }
            end = previous
        }
        return String(scalars[start..<end])
    }

    static func projectNameError(_ value: String) -> ProjectNameValidationError? {
        let name = jsTrim(value)
        if name.isEmpty { return .empty }
        if name == "." || name == ".." { return .reservedDotName }
        if name.unicodeScalars.contains(where: isIllegalNameScalar) { return .illegalCharacter }
        if name.utf16.count > 255 { return .tooLong }
        return nil
    }

    /// Mirrors the host allowlist before a URL reaches `git clone`.
    static func isSafeCloneURL(_ rawValue: String) -> Bool {
        let value = jsTrim(rawValue)
        guard !value.isEmpty, !value.hasPrefix("-") else { return false }
        if hasRemoteHelperPrefix(value) { return false }

        if let separator = value.range(of: "://") {
            let scheme = String(value[..<separator.lowerBound])
            if isScheme(scheme) {
                return safeCloneSchemes.contains(scheme.lowercased())
            }
        }

        if let colon = value.firstIndex(of: ":") {
            let prefix = String(value[..<colon])
            if isScheme(prefix), !isSCPLike(value) { return false }
        }
        return isSCPLike(value)
    }

    private static func isJSTrimScalar(_ value: UInt32) -> Bool {
        switch value {
        case 0x0009...0x000D, 0x0020, 0x00A0, 0x1680,
            0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            true
        default:
            false
        }
    }

    private static func isIllegalNameScalar(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x2F, 0x5C, 0x3A, 0x2A, 0x3F, 0x22, 0x3C, 0x3E, 0x7C:
            true
        default:
            false
        }
    }

    private static func hasRemoteHelperPrefix(_ value: String) -> Bool {
        guard let marker = value.range(of: "::") else { return false }
        let prefix = value[..<marker.lowerBound]
        return prefix.allSatisfy { character in
            character.isASCII
                && (character.isLetter || character.isNumber || "+.-".contains(character))
        }
    }

    private static func isScheme(_ value: String) -> Bool {
        guard let first = value.first, first.isASCII, first.isLetter else { return false }
        return value.dropFirst().allSatisfy { character in
            character.isASCII
                && (character.isLetter || character.isNumber || "+.-".contains(character))
        }
    }

    private static func isSCPLike(_ value: String) -> Bool {
        guard let colon = value.firstIndex(of: ":"), colon != value.startIndex else { return false }
        let authority = value[..<colon]
        let path = value[value.index(after: colon)...]
        guard !path.isEmpty,
            !authority.contains("/"),
            !authority.contains("\\"),
            let at = authority.lastIndex(of: "@"),
            at != authority.startIndex
        else { return false }
        return authority.index(after: at) != authority.endIndex
    }
}
