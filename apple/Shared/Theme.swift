import Foundation

/// A theme, mirroring `Theme` in extension/src/shared/theme.ts.
struct Theme: Identifiable, Hashable {
    var id: String
    var name: String
    /// `#rrggbb`
    var background: String
    /// `#rrggbb`
    var text: String
    var imageBrightness: Double
    var grayscale: Double
    var collection: String?

    init(id: String, name: String, background: String, text: String, imageBrightness: Double = 1, grayscale: Double = 0, collection: String? = nil) {
        self.id = id
        self.name = name
        self.background = background
        self.text = text
        self.imageBrightness = imageBrightness
        self.grayscale = grayscale
        self.collection = collection
    }

    init?(dictionary d: [String: Any]) {
        guard let id = d["id"] as? String else { return nil }
        self.init(
            id: id,
            name: d["name"] as? String ?? "Untitled",
            background: d["background"] as? String ?? "#1c1c1e",
            text: d["text"] as? String ?? "#e3e3e6",
            imageBrightness: d["imageBrightness"] as? Double ?? 1,
            grayscale: d["grayscale"] as? Double ?? 0,
            collection: d["collection"] as? String
        )
    }

    var dictionary: [String: Any] {
        var d: [String: Any] = [
            "id": id, "name": name, "background": background, "text": text,
            "imageBrightness": imageBrightness, "grayscale": grayscale,
        ]
        if let collection { d["collection"] = collection }
        return d
    }

    /// Built-in library, loaded from the same JSON file the web extension bundles.
    static let builtIn: [Theme] = {
        guard let url = Bundle.main.url(forResource: "builtin-themes", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return list.compactMap(Theme.init(dictionary:))
    }()

    private static func normalizeHex(_ value: String?) -> String? {
        guard var hex = value?.trimmingCharacters(in: .whitespaces).lowercased() else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        guard hex.count == 6, hex.allSatisfy(\.isHexDigit) else { return nil }
        return "#" + hex
    }

    private static func unit(_ value: String?, fallback: Double, min lo: Double) -> Double {
        guard let value, var n = Double(value.replacingOccurrences(of: "%", with: "")) else { return fallback }
        if n > 1 || value.hasSuffix("%") { n /= 100 }
        return Swift.min(1, Swift.max(lo, n))
    }

    /// Parses a share link: `https://azimi.me/nyx/theme/?…`, `nyx://theme?…`,
    /// or links shared from Noir (`https://getnoir.app/theme?…`, `noir://theme?…`).
    init?(shareURL url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let isCustomScheme = ["nyx", "noir"].contains(components.scheme?.lowercased() ?? "")
        let route = isCustomScheme ? (components.host ?? "") + components.path : components.path
        guard route.trimmingCharacters(in: CharacterSet(charactersIn: "/")).hasSuffix("theme") else { return nil }
        var query: [String: String] = [:]
        for item in components.queryItems ?? [] where query[item.name] == nil {
            query[item.name] = item.value?.replacingOccurrences(of: "+", with: " ")
        }
        guard let bg = Self.normalizeHex(query["bg"] ?? query["background"]),
              let text = Self.normalizeHex(query["text"] ?? query["fg"]) else { return nil }
        let name = (query["name"] ?? "").trimmingCharacters(in: .whitespaces)
        self.init(
            id: "custom-\(UUID().uuidString.lowercased())",
            name: name.isEmpty ? "Imported Theme" : String(name.prefix(80)),
            background: bg,
            text: text,
            imageBrightness: Self.unit(query["imageBrightness"], fallback: 1, min: 0.3),
            grayscale: Self.unit(query["imageGrayscale"] ?? query["grayscale"], fallback: 0, min: 0)
        )
    }
}
