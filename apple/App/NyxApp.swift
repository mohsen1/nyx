import SwiftUI
#if os(macOS)
import AppKit
#endif

@main
struct NyxApp: App {
    @StateObject private var model = AppModel()
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .onOpenURL { model.handle(url: $0) }
        }
        #if os(macOS)
        .defaultSize(width: 520, height: 680)
        #endif
    }
}

#if os(macOS)
/// Whether Nyx shows an icon in the Dock. Without one it runs as an accessory app: no Dock icon
/// or menu bar, and it quits when its window closes (there is no other way back to the window).
enum DockIcon {
    static let key = "showInDock"

    static var isShown: Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    static func apply(_ show: Bool) {
        NSApp.setActivationPolicy(show ? .regular : .accessory)
        // Switching to accessory hides the app; keep the settings window in front.
        DispatchQueue.main.async {
            NSApp.activate(ignoringOtherApps: true)
            NSApp.windows.first { $0.canBecomeMain }?.makeKeyAndOrderFront(nil)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        if !DockIcon.isShown { NSApp.setActivationPolicy(.accessory) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        !DockIcon.isShown
    }
}
#endif

/// Observable view of SettingsStore for SwiftUI.
@MainActor
final class AppModel: ObservableObject {
    @Published var mode = "auto"
    @Published var autoTrigger = "system"
    @Published var start = "20:00"
    @Published var end = "07:00"
    @Published var defaultThemeId = "dark"
    @Published var themes: [Theme] = []
    @Published var pausedUntil: Date?
    @Published var focusFilterApplied = false
    @Published var importMessage: String?

    private let store = SettingsStore.shared

    init() {
        reload()
        NotificationCenter.default.addObserver(forName: SettingsStore.didChange, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reload() }
        }
    }

    func reload() {
        mode = store.globalMode
        autoTrigger = store.autoTrigger
        let schedule = store.schedule
        start = schedule.start
        end = schedule.end
        defaultThemeId = store.defaultThemeId
        themes = store.allThemes
        pausedUntil = store.pausedUntil
        focusFilterApplied = NyxFocusFilter.isApplied
    }

    func setMode(_ value: String) { store.setGlobalMode(value) }
    func setTheme(_ id: String) { store.setDefaultTheme(id) }
    func setSchedule(trigger: String, start: String, end: String) { store.setSchedule(trigger: trigger, start: start, end: end) }
    func togglePause() { pausedUntil == nil ? store.pauseEverywhereUntilTomorrow() : store.resume() }
    func stopFocusFilter() {
        NyxFocusFilter.restore()
        reload()
    }

    /// Imports a shared theme (nyx://theme?…, or a pasted https:// / noir:// link).
    func handle(url: URL) {
        guard let theme = Theme(shareURL: url) else {
            importMessage = "That link is not a theme."
            return
        }
        store.addCustomTheme(theme)
        importMessage = "Added “\(theme.name)”."
    }

    func importLink(_ text: String) {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            importMessage = "That link is not a theme."
            return
        }
        handle(url: url)
    }
}
