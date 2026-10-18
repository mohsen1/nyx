import AppIntents
import SwiftUI
import WidgetKit

/// Turns Nyx on (Auto) or off from Control Center, the Lock Screen or the Action button.
struct ToggleNyxIntent: SetValueIntent {
    static var title: LocalizedStringResource = "Turn Nyx On or Off"

    @Parameter(title: "Enabled")
    var value: Bool

    func perform() async throws -> some IntentResult {
        SettingsStore.shared.setGlobalMode(value ? "auto" : "off")
        return .result()
    }
}

struct NyxControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.nyx.NyxDarkMode.status") {
            ControlWidgetToggle(
                "Nyx",
                isOn: SettingsStore.shared.globalMode != "off",
                action: ToggleNyxIntent()
            ) { isOn in
                Label(isOn ? SettingsStore.shared.globalMode.capitalized : "Off", systemImage: isOn ? "moon.fill" : "moon")
            }
        }
        .displayName("Nyx")
        .description("Turn dark mode for websites on or off.")
    }
}

@main
struct NyxWidgets: WidgetBundle {
    var body: some Widget {
        NyxControl()
    }
}
