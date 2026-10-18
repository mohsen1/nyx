import AppIntents

/// Shortcuts that appear in Spotlight and the Shortcuts app without any setup.
struct NyxShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SetStatusIntent(),
            phrases: ["Set \(.applicationName) status", "Set \(.applicationName) to \(\.$status)"],
            shortTitle: "Set Status",
            systemImageName: "moon"
        )
        AppShortcut(
            intent: PauseUntilTomorrowIntent(),
            phrases: ["Pause \(.applicationName) until tomorrow", "Pause \(.applicationName)"],
            shortTitle: "Pause Until Tomorrow",
            systemImageName: "pause.circle"
        )
        AppShortcut(
            intent: SetDefaultThemeIntent(),
            phrases: ["Set \(.applicationName) theme"],
            shortTitle: "Set Default Theme",
            systemImageName: "paintpalette"
        )
    }
}
