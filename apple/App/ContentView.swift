import SwiftUI
#if os(macOS)
import SafariServices
#endif

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @State private var link = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Dark mode", selection: Binding(get: { model.mode }, set: model.setMode)) {
                        Text("Auto").tag("auto")
                        Text("On").tag("on")
                        Text("Off").tag("off")
                    }
                    .pickerStyle(.segmented)
                    if model.mode == "auto" {
                        Picker("Auto follows", selection: Binding(
                            get: { model.autoTrigger },
                            set: { model.setSchedule(trigger: $0, start: model.start, end: model.end) }
                        )) {
                            Text("System appearance").tag("system")
                            Text("Schedule").tag("schedule")
                        }
                        if model.autoTrigger == "schedule" {
                            TimeField(title: "From", value: model.start) { model.setSchedule(trigger: "schedule", start: $0, end: model.end) }
                            TimeField(title: "To", value: model.end) { model.setSchedule(trigger: "schedule", start: model.start, end: $0) }
                        }
                    }
                } footer: {
                    Text(statusCaption)
                }

                Section {
                    Button {
                        model.togglePause()
                    } label: {
                        Label(
                            model.pausedUntil == nil ? "Pause all until tomorrow" : "Resume all websites",
                            systemImage: model.pausedUntil == nil ? "pause.circle" : "play.circle"
                        )
                    }
                    if model.focusFilterApplied {
                        Button {
                            model.stopFocusFilter()
                        } label: {
                            Label("Stop Focus filter", systemImage: "moon.circle")
                        }
                    }
                } footer: {
                    if let until = model.pausedUntil {
                        Text("Paused until \(until.formatted(date: .omitted, time: .shortened)).")
                    }
                }

                Section {
                    NavigationLink {
                        ThemeList()
                    } label: {
                        LabeledContent {
                            Text(currentTheme?.name ?? "")
                        } label: {
                            Label {
                                Text("Default theme")
                            } icon: {
                                if let theme = currentTheme { ThemeSwatch(theme: theme, size: 22) }
                            }
                        }
                    }
                    TextField("Theme link", text: $link, prompt: Text("Paste a theme link"))
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif
                        .onSubmit(importLink)
                    Button("Add theme", action: importLink)
                        .disabled(link.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("Theme")
                } footer: {
                    if let message = model.importMessage { Text(message) }
                }

                Section {
                    #if os(macOS)
                    Button {
                        SFSafariApplication.showPreferencesForExtension(withIdentifier: "app.nyx.NyxDarkMode.Extension")
                    } label: {
                        Label("Open Safari extension settings", systemImage: "safari")
                    }
                    #else
                    Label("Settings → Apps → Safari → Extensions → Nyx", systemImage: "safari")
                    #endif
                } header: {
                    Text("Set up")
                } footer: {
                    Text("Turn on Nyx and allow it on all websites.")
                }

                Section {
                    LabeledContent("Version", value: version)
                    AboutLink(title: "Website", systemImage: "globe", url: "https://azimi.me/nyx/")
                    AboutLink(title: "Source code", systemImage: "chevron.left.forwardslash.chevron.right", url: "https://github.com/mohsen1/nyx")
                    AboutLink(title: "Privacy", systemImage: "hand.raised", url: "https://azimi.me/nyx/privacy/")
                    AboutLink(title: "Support", systemImage: "questionmark.circle", url: "https://azimi.me/nyx/support/")
                } header: {
                    Text("About")
                } footer: {
                    Text("Nyx doesn’t collect any data.")
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Nyx")
        }
    }

    private var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    }

    private var currentTheme: Theme? {
        model.themes.first { $0.id == model.defaultThemeId } ?? model.themes.first
    }

    private func importLink() {
        model.importLink(link)
        link = ""
    }

    private var statusCaption: String {
        switch model.mode {
        case "on": return "Websites are always dark."
        case "off": return "Websites stay as they are, unless you turn Nyx on for one in Safari."
        default: return model.autoTrigger == "schedule"
            ? "Websites are dark from \(model.start) to \(model.end)."
            : "Websites are dark when your device is in Dark Mode."
        }
    }
}

private struct AboutLink: View {
    let title: String
    let systemImage: String
    let url: String

    var body: some View {
        Link(destination: URL(string: url)!) {
            HStack {
                Label(title, systemImage: systemImage)
                Spacer()
                Image(systemName: "arrow.up.right").font(.footnote).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
    }
}

/// The theme library, grouped by collection. Picking a theme makes it the default.
private struct ThemeList: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            ForEach(collections, id: \.name) { collection in
                Section(collection.name) {
                    ForEach(collection.themes) { theme in
                        Button {
                            model.setTheme(theme.id)
                        } label: {
                            HStack(spacing: 12) {
                                ThemeSwatch(theme: theme, size: 28)
                                Text(theme.name).foregroundStyle(.primary)
                                Spacer()
                                if theme.id == model.defaultThemeId {
                                    Image(systemName: "checkmark").foregroundStyle(.tint).fontWeight(.semibold)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(theme.id == model.defaultThemeId ? .isSelected : [])
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Default theme")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private var collections: [(name: String, themes: [Theme])] {
        var order: [String] = []
        var groups: [String: [Theme]] = [:]
        for theme in model.themes {
            let name = theme.collection ?? "My Themes"
            if groups[name] == nil { order.append(name) }
            groups[name, default: []].append(theme)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }
}

private struct TimeField: View {
    let title: String
    let value: String
    let onChange: (String) -> Void

    var body: some View {
        DatePicker(title, selection: Binding(
            get: { Self.date(from: value) },
            set: { onChange(Self.string(from: $0)) }
        ), displayedComponents: .hourAndMinute)
    }

    private static func date(from hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(bySettingHour: parts.first ?? 20, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: Date()) ?? Date()
    }

    private static func string(from date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

private struct ThemeSwatch: View {
    let theme: Theme
    var size: CGFloat = 28

    var body: some View {
        Text("Aa")
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundStyle(Color(hex: theme.text))
            .frame(width: size, height: size)
            .background(Color(hex: theme.background), in: RoundedRectangle(cornerRadius: size * 0.25, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous).strokeBorder(.secondary.opacity(0.3)))
            .accessibilityHidden(true)
    }
}

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }
}
