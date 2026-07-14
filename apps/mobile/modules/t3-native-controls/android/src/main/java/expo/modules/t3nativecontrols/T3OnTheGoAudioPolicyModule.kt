package expo.modules.t3nativecontrols

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3OnTheGoAudioPolicyModule : Module() {
  private var audioCallback: AudioDeviceCallback? = null
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("T3OnTheGoAudioPolicy")
    Events("onPolicyChanged")
    Function("getCurrentState") { currentState() }
    OnStartObserving { startObserving() }
    OnStopObserving { stopObserving() }
  }

  private fun startObserving() {
    val context = appContext.reactContext ?: return
    if (audioCallback == null) {
      audioCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = emit()
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = emit()
      }
      audioManager(context).registerAudioDeviceCallback(audioCallback, null)
    }
    if (receiver == null) {
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) = emit()
      }
      context.registerReceiver(
        receiver,
        IntentFilter().apply {
          addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
          addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
      )
    }
  }

  private fun stopObserving() {
    val context = appContext.reactContext ?: return
    audioCallback?.let { audioManager(context).unregisterAudioDeviceCallback(it) }
    audioCallback = null
    receiver?.let { runCatching { context.unregisterReceiver(it) } }
    receiver = null
  }

  private fun emit() {
    sendEvent("onPolicyChanged", currentState())
  }

  private fun currentState(): Map<String, Any> {
    val context = appContext.reactContext
      ?: return mapOf("route" to "unknown", "audioFocus" to "call", "lowPowerMode" to true)
    val audio = audioManager(context)
    val outputs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    val route = when {
      outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || it.type == AudioDeviceInfo.TYPE_BLE_HEADSET } -> "bluetooth"
      outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_HEADSET } -> "wired-headset"
      outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE } -> "receiver"
      outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER } -> "speaker"
      else -> "unknown"
    }
    val focus = if (audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION) "call" else "available"
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return mapOf("route" to route, "audioFocus" to focus, "lowPowerMode" to power.isPowerSaveMode)
  }

  private fun audioManager(context: Context) =
    context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
}
