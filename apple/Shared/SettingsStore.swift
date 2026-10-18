import Foundation

/// Shared settings storage for the app, the Safari extension handler, intents and widgets.
///
/// Settings are the same JSON document the web extension keeps in `browser.storage.local`
/// (see extension/src/shared/settings.ts). Native code edits it as a dictionary so that fields
/// it does not know about survive untouched. The document is kept in the App Group (shared
/// between processes on this device) and in iCloud key-value storage (shared between devices).
/// The web extension merges both copies with its own, per entry, by `updatedAt`.
final class SettingsStore {
    static let shared = SettingsStore()

    static let appGroup = "group.app.nyx.NyxDarkMode"
    private static let key = "settings"
    static let didChange = Notification.Name("NyxSettingsDidChange")

    private let defaults: UserDefaults
    private let cloud = NSUbiquitousKeyValueStore.default

    private init() {
        defaults = UserDefaults(suiteName: SettingsStore.appGroup) ?? .standard
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud,
            queue: .main
        ) { _ in
            NotificationCenter.default.post(name: SettingsStore.didChange, object: nil)
        }
        cloud.synchronize()
    }

    // MARK: Raw JSON (used by the extension handler)

    /// This device's copy.
    func localJSON() -> String? { defaults.string(forKey: Self.key) }

    /// The copy most recently written by any device.
    func cloudJSON() -> String? { cloud.string(forKey: Self.key) }

    func save(json: String) {
        defaults.set(json, forKey: Self.key)
        // iCloud key-value values are limited to 1 MB; settings are far smaller.
        if json.utf8.count < 900_000 { cloud.set(json, forKey: Self.key) }
        cloud.synchronize()
        NotificationCenter.default.post(name: Self.didChange, object: nil)
    }

    // MARK: Dictionary access

    private func parse(_ json: String?) -> [String: Any]? {
        guard let data = json?.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func updatedAt(_ settings: [String: Any]) -> Double {
        ((settings["global"] as? [String: Any])?["updatedAt"] as? Double) ?? 0
    }

    /// The newer of the local and iCloud copies (by the global `updatedAt`).
    func load() -> [String: Any] {
        let local = parse(localJSON())
        let remote = parse(cloudJSON())
        switch (local, remote) {
        case let (l?, r?): return updatedAt(r) > updatedAt(l) ? r : l
        case let (l?, nil): return l
        case let (nil, r?): return r
        default: return ["version": 1, "global": [String: Any](), "sites": [String: Any](), "customThemes": [Any]()]
        }
    }

    func save(_ settings: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: settings),
              let json = String(data: data, encoding: .utf8) else { return }
        save(json: json)
    }

    private static func nowMillis() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }

    /// Applies `patch` to the global settings and bumps their `updatedAt`.
    func updateGlobal(_ patch: [String: Any]) {
        var settings = load()
        var global = settings["global"] as? [String: Any] ?? [:]
        for (k, v) in patch { global[k] = v }
        global["updatedAt"] = Self.nowMillis()
        settings["global"] = global
        save(settings)
    }

    /// Applies `patch` to one website's settings (creating them if needed).
    func updateSite(_ siteKey: String, _ patch: [String: Any]) {
        var settings = load()
        var sites = settings["sites"] as? [String: Any] ?? [:]
        var site = sites[siteKey] as? [String: Any] ?? [
            "mode": "default", "themeId": NSNull(), "pausedUntil": NSNull(),
            "ignoreBuiltInDarkMode": NSNull(), "appearance": [String: Any](),
        ]
        for (k, v) in patch { site[k] = v }
        site["updatedAt"] = Self.nowMillis()
        sites[siteKey] = site
        settings["sites"] = sites
        save(settings)
    }

    // MARK: Typed helpers

    var globalMode: String {
        ((load()["global"] as? [String: Any])?["mode"] as? String) ?? "auto"
    }

    var autoTrigger: String {
        ((load()["global"] as? [String: Any])?["autoTrigger"] as? String) ?? "system"
    }

    var schedule: (start: String, end: String) {
        let s = (load()["global"] as? [String: Any])?["schedule"] as? [String: Any]
        return ((s?["start"] as? String) ?? "20:00", (s?["end"] as? String) ?? "07:00")
    }

    var defaultThemeId: String {
        ((load()["global"] as? [String: Any])?["defaultThemeId"] as? String) ?? "dark"
    }

    var pausedUntil: Date? {
        guard let ms = (load()["global"] as? [String: Any])?["pausedUntil"] as? Double,
              ms > Date().timeIntervalSince1970 * 1000 else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    func setGlobalMode(_ mode: String) {
        updateGlobal(["mode": mode, "pausedUntil": NSNull()])
    }

    func setDefaultTheme(_ id: String) {
        updateGlobal(["defaultThemeId": id])
    }

    func setSchedule(trigger: String, start: String, end: String) {
        updateGlobal(["autoTrigger": trigger, "schedule": ["start": start, "end": end]])
    }

    /// Same rule as the web extension: the next 06:00 that is at least an hour away.
    static func tomorrowMorning(from now: Date = Date()) -> Date {
        let calendar = Calendar.current
        var morning = calendar.date(bySettingHour: 6, minute: 0, second: 0, of: now) ?? now
        if morning.timeIntervalSince(now) < 3600 {
            morning = calendar.date(byAdding: .day, value: 1, to: morning) ?? morning
        }
        return morning
    }

    func pauseEverywhereUntilTomorrow() {
        updateGlobal(["pausedUntil": (Self.tomorrowMorning().timeIntervalSince1970 * 1000).rounded()])
    }

    func resume() {
        updateGlobal(["pausedUntil": NSNull()])
    }

    func setSiteMode(_ siteKey: String, mode: String) {
        updateSite(Self.normalizeSiteKey(siteKey), ["mode": mode, "pausedUntil": NSNull()])
    }

    static func normalizeSiteKey(_ input: String) -> String {
        var key = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let range = key.range(of: "://") { key = String(key[range.upperBound...]) }
        if key.hasPrefix("www.") { key = String(key.dropFirst(4)) }
        while key.hasSuffix("/") { key.removeLast() }
        return key
    }

    // MARK: Themes

    var customThemes: [Theme] {
        (load()["customThemes"] as? [[String: Any]] ?? []).compactMap(Theme.init(dictionary:))
    }

    /// Built-in themes (with the user's edits) followed by custom themes.
    var allThemes: [Theme] {
        let settings = load()
        let overrides = settings["themeOverrides"] as? [String: [String: Any]] ?? [:]
        let hidden = Set(settings["hiddenThemeIds"] as? [String] ?? [])
        let builtIns = Theme.builtIn
            .filter { !hidden.contains($0.id) }
            .map { theme in overrides[theme.id].flatMap(Theme.init(dictionary:)) ?? theme }
        return builtIns + customThemes
    }

    func addCustomTheme(_ theme: Theme) {
        var settings = load()
        var list = settings["customThemes"] as? [[String: Any]] ?? []
        list.append(theme.dictionary)
        settings["customThemes"] = list
        save(settings)
        // Library edits bump the global timestamp, which orders library changes when syncing.
        updateGlobal([:])
    }
}
