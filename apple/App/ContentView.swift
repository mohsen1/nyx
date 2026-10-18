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
                    Picker("Status", selection: Binding(get: { model.mode }, set: model.setMode)) {
                        Text("Auto").tag("auto")
                        Text("On").tag("on")
                        Text("Off").tag("off")
                    }
                    .pickerStyle(.segmented)
                    Text(statusCaption).font(.footnote).foregroundStyle(.secondary)
                    if model.mode == "auto" {
                        Picker("Auto follows", selection: Binding(
                            get: { model.autoTrigger },
                            set: { model.setSchedule(trigger: $0, start: model.start, end: model.end) }
                        )) {
                            Text("System Dark Mode").tag("system")
                            Text("Schedule").tag("schedule")
                        }
                        if model.autoTrigger == "schedule" {
                            TimeField(title: "From", value: model.start) { model.setSchedule(trigger: "schedule", start: $0, end: model.end) }
                            TimeField(title: "To", value: model.end) { model.setSchedule(trigger: "schedule", start: model.start, end: $0) }
                        }
                    }
                    Button(model.pausedUntil == nil ? "Pause Everywhere Until Tomorrow" : "Resume") { model.togglePause() }
                    if let until = model.pausedUntil {
                        Text("Paused until \(until.formatted(date: .omitted, time: .shortened))").font(.footnote).foregroundStyle(.secondary)
                    }
                    if model.focusFilterApplied {
                        Button("Stop Focus Filter") { model.stopFocusFilter() }
                    }
                } header: {
                    Text("Default Settings")
                } footer: {
                    Text("These settings apply to every website unless a website has its own settings. Change website settings from the Nyx menu in Safari.")
                }

                Section("Default Theme") {
                    ForEach(model.themes) { theme in
                        Button { model.setTheme(theme.id) } label: {
                            HStack {
                                ThemeSwatch(theme: theme)
                                Text(theme.name).foregroundStyle(.primary)
                                Spacer()
                                if theme.id == model.defaultThemeId { Image(systemName: "checkmark").foregroundStyle(.tint) }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section {
                    TextField("Theme link", text: $link)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif
                    Button("Import Theme") { model.importLink(link); link = "" }
                        .disabled(link.isEmpty)
                    if let message = model.importMessage { Text(message).font(.footnote) }
                } header: {
                    Text("Import")
                } footer: {
                    Text("Paste a shared theme link. Links shared from Noir work too. Edit themes in Nyx Settings, opened from the Nyx menu in Safari.")
                }

                Section("Set Up") {
                    #if os(macOS)
                    Button("Open Safari Extension Settings") {
                        SFSafariApplication.showPreferencesForExtension(withIdentifier: "app.nyx.NyxDarkMode.Extension")
                    }
                    Text("Turn on Nyx, then choose Always Allow on Every Website so Nyx can darken pages as they load.")
                        .font(.footnote).foregroundStyle(.secondary)
                    #else
                    Text("Open Settings → Apps → Safari → Extensions → Nyx. Turn on the extension and set Permissions → All Websites to Allow.")
                        .font(.footnote)
                    #endif
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Nyx")
        }
    }

    private var statusCaption: String {
        switch model.mode {
        case "on": return "Nyx will always darken websites."
        case "off": return "Nyx will never darken websites, unless a website is set to On."
        default: return model.autoTrigger == "schedule"
            ? "Nyx will darken websites between \(model.start) and \(model.end)."
            : "Nyx will darken websites when Dark Mode is on."
        }
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

    var body: some View {
        Text("Aa")
            .font(.caption.bold())
            .foregroundStyle(Color(hex: theme.text))
            .frame(width: 30, height: 30)
            .background(Color(hex: theme.background), in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(.secondary.opacity(0.3)))
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
