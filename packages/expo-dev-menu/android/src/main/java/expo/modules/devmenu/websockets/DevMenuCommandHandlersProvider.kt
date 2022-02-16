package expo.modules.devmenu.websockets

import android.util.Log
import com.facebook.react.ReactInstanceManager
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.packagerconnection.NotificationOnlyHandler
import expo.interfaces.devmenu.DevMenuManagerInterface
import expo.modules.devmenu.devtools.DevMenuDevSettings
import org.json.JSONObject
import java.lang.ref.WeakReference

class DevMenuCommandHandlersProvider(
  private val manager: DevMenuManagerInterface,
  reactInstanceManager: ReactInstanceManager
) {
  private val _instanceManager = WeakReference(reactInstanceManager)
  private val instanceManager
    get() = _instanceManager.get()

  private val onReload = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      manager.closeMenu()
      UiThreadUtil.runOnUiThread {
        instanceManager?.devSupportManager?.handleReloadJS()
      }
    }
  }

  private val onDevMenu = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      val activity = instanceManager?.currentReactContext?.currentActivity ?: return
      manager.toggleMenu(activity)
    }
  }

  private val onDevCommand = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      val instanceManager = instanceManager ?: return

      if (params is JSONObject) {
        val command = params.optString("name") ?: return

        when (command) {
          "reload" -> DevMenuDevSettings.reload()
          "toggleDevMenu" -> {
            val activity = instanceManager.currentReactContext?.currentActivity ?: return
            manager.toggleMenu(activity)
          }
          "toggleRemoteDebugging" -> DevMenuDevSettings.toggleRemoteDebugging()
          "toggleElementInspector" -> DevMenuDevSettings.toggleElementInspector()
          "togglePerformanceMonitor" -> {
            DevMenuDevSettings.togglePerformanceMonitor()
          }
          "openJsInspector" -> DevMenuDevSettings.openJsInspector()
          else -> Log.w("DevMenu", "Unknown command: $command")
        }
      }
    }
  }

  fun createCommandHandlers(): Map<String, NotificationOnlyHandler> {
    return mapOf(
      "reload" to onReload,
      "devMenu" to onDevMenu,
      "sendDevCommand" to onDevCommand
    )
  }
}
