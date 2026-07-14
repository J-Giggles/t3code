import AVFAudio
import ExpoModulesCore

public final class T3OnTheGoAudioPolicyModule: Module {
  private var observers: [NSObjectProtocol] = []
  private var interrupted = false

  public func definition() -> ModuleDefinition {
    Name("T3OnTheGoAudioPolicy")
    Events("onPolicyChanged")

    Function("getCurrentState") { currentState() }

    OnStartObserving { startObserving() }
    OnStopObserving { stopObserving() }
  }

  private func startObserving() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers = [
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in self?.emit() },
      center.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let self else { return }
        let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        interrupted = raw == AVAudioSession.InterruptionType.began.rawValue
        emit()
      },
      center.addObserver(
        forName: Notification.Name.NSProcessInfoPowerStateDidChange,
        object: nil,
        queue: .main
      ) { [weak self] _ in self?.emit() },
    ]
  }

  private func stopObserving() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
  }

  private func emit() {
    sendEvent("onPolicyChanged", currentState())
  }

  private func currentState() -> [String: Any] {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let route: String
    if outputs.contains(where: { $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE }) {
      route = "bluetooth"
    } else if outputs.contains(where: { $0.portType == .headphones || $0.portType == .headsetMic || $0.portType == .usbAudio }) {
      route = "wired-headset"
    } else if outputs.contains(where: { $0.portType == .builtInReceiver }) {
      route = "receiver"
    } else if outputs.contains(where: { $0.portType == .builtInSpeaker }) {
      route = "speaker"
    } else {
      route = "unknown"
    }
    return [
      "route": route,
      "audioFocus": interrupted ? "call" : "available",
      "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
    ]
  }
}
