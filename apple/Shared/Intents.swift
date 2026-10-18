import AppIntents
import Foundation

enum NyxStatus: String, AppEnum {
    case auto, on, off

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Status"
    static var caseDisplayRepresentations: [NyxStatus: DisplayRepresentation] = [
        .auto: DisplayRepresentation(title: "Auto", subtitle: "Follow Dark Mode or the schedule"),
        .on: DisplayRepresentation(title: "On", subtitle: "Always darken websites"),
        .off: DisplayRepresentation(title: "Off", subtitle: "Never darken websites"),
    ]
}

enum NyxWebsiteStatus: String, AppEnum {
    case `default`, auto, on, off

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Website Status"
    static var caseDisplayRepresentations: [NyxWebsiteStatus: DisplayRepresentation] = [
        .default: "Default", .auto: "Auto", .on: "On", .off: "Off",
    ]
}

struct ThemeEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Theme"
    static var defaultQuery = ThemeQuery()
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }

    init(_ theme: Theme) {
        id = theme.id
        name = theme.name
    }
}

struct ThemeQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ThemeEntity] {
        SettingsStore.shared.allThemes.filter { identifiers.contains($0.id) }.map(ThemeEntity.init)
    }

    func suggestedEntities() async throws -> [ThemeEntity] {
        SettingsStore.shared.allThemes.map(ThemeEntity.init)
    }
}

struct SetStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Nyx Status"
    static var description = IntentDescription("Sets whether Nyx darkens websites: Auto, On or Off.")

    @Parameter(title: "Status", default: .auto)
    var status: NyxStatus

    init() {}
    init(status: NyxStatus) { self.status = status }

    static var parameterSummary: some ParameterSummary { Summary("Set Nyx to \(\.$status)") }

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.setGlobalMode(status.rawValue)
        return .result()
    }
}

struct SetDefaultThemeIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Default Theme"
    static var description = IntentDescription("Changes the theme Nyx uses for websites without their own theme.")

    @Parameter(title: "Theme")
    var theme: ThemeEntity

    static var parameterSummary: some ParameterSummary { Summary("Set the default theme to \(\.$theme)") }

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.setDefaultTheme(theme.id)
        return .result()
    }
}

struct SetWebsiteStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Website Status"
    static var description = IntentDescription("Sets Nyx's status for one website, subdomain or page.")

    @Parameter(title: "Website", description: "For example example.com, app.example.com or example.com/page")
    var website: String

    @Parameter(title: "Status", default: .off)
    var status: NyxWebsiteStatus

    static var parameterSummary: some ParameterSummary { Summary("Set \(\.$website) to \(\.$status)") }

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.setSiteMode(website, mode: status.rawValue)
        return .result()
    }
}

struct PauseUntilTomorrowIntent: AppIntent {
    static var title: LocalizedStringResource = "Pause Nyx Until Tomorrow"
    static var description = IntentDescription("Stops darkening websites until tomorrow morning.")

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.pauseEverywhereUntilTomorrow()
        return .result()
    }
}

struct ResumeIntent: AppIntent {
    static var title: LocalizedStringResource = "Resume Nyx"
    static var description = IntentDescription("Ends a pause.")

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.resume()
        return .result()
    }
}

/// Applies a status and/or theme while a Focus is active, and restores the previous values afterwards.
struct NyxFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Set Nyx Status"
    static var description: IntentDescription? = IntentDescription("Darken websites differently while this Focus is on.")

    @Parameter(title: "Status", default: .on)
    var status: NyxStatus

    @Parameter(title: "Theme")
    var theme: ThemeEntity?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "Nyx \(status.rawValue.capitalized)",
            subtitle: theme.map { LocalizedStringResource(stringLiteral: $0.name) }
        )
    }

    private static let savedKey = "focusFilterSavedState"

    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: SettingsStore.appGroup) ?? .standard
        let store = SettingsStore.shared
        // The system calls perform() when the Focus turns on and again when it turns off.
        let active = (try? await Self.current) != nil
        if active {
            if defaults.dictionary(forKey: Self.savedKey) == nil {
                defaults.set(["mode": store.globalMode, "theme": store.defaultThemeId], forKey: Self.savedKey)
            }
            var patch: [String: Any] = ["mode": status.rawValue, "pausedUntil": NSNull()]
            if let theme { patch["defaultThemeId"] = theme.id }
            store.updateGlobal(patch)
        } else {
            Self.restore()
        }
        return .result()
    }

    /// Restores the settings saved when a Focus Filter was applied ("Stop Focus Filter" in the app).
    static func restore() {
        let defaults = UserDefaults(suiteName: SettingsStore.appGroup) ?? .standard
        guard let saved = defaults.dictionary(forKey: savedKey) else { return }
        var patch: [String: Any] = [:]
        if let mode = saved["mode"] as? String { patch["mode"] = mode }
        if let theme = saved["theme"] as? String { patch["defaultThemeId"] = theme }
        SettingsStore.shared.updateGlobal(patch)
        defaults.removeObject(forKey: savedKey)
    }

    static var isApplied: Bool {
        (UserDefaults(suiteName: SettingsStore.appGroup) ?? .standard).dictionary(forKey: savedKey) != nil
    }
}
