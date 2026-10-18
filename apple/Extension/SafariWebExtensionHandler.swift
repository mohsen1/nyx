import Foundation
import SafariServices

/// Answers `browser.runtime.sendNativeMessage` calls from the web extension's background script.
///
/// Messages (see extension/src/background/sync.ts):
/// - `{type: "ping"}` → `{ok: true}`
/// - `{type: "pull"}` → `{ok: true, settings: <this device's JSON>, remote: <iCloud JSON>}`
/// - `{type: "push", settings: <JSON>}` → `{ok: true}`
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let store = SettingsStore.shared
        var reply: [String: Any] = ["ok": true]

        switch message?["type"] as? String {
        case "ping":
            break
        case "pull":
            if let local = store.localJSON() { reply["settings"] = local }
            if let remote = store.cloudJSON() { reply["remote"] = remote }
        case "push":
            if let json = message?["settings"] as? String { store.save(json: json) }
            else { reply = ["ok": false, "error": "missing settings"] }
        default:
            reply = ["ok": false, "error": "unknown message"]
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
