package dev.fx.chat

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Edge-to-edge draws the webview under the system bars, and on Android 15+
    // the window no longer resizes for the keyboard. Pad the content view by
    // the system-bar, cutout and keyboard insets so the web UI always lays out
    // inside the visible, unobstructed area (its own safe-area insets are 0).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime(),
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    requestLocalNetwork()
  }

  /**
   * Android 17 (API 37) blocks connections to local-network addresses unless
   * the app holds ACCESS_LOCAL_NETWORK. Endpoints are often on the LAN (a home
   * server, or a public name that split DNS resolves to one), so ask at every
   * launch until it is granted; after repeated denials Android stops showing
   * the dialog.
   */
  private fun requestLocalNetwork() {
    if (Build.VERSION.SDK_INT < 37) return
    if (checkSelfPermission(LOCAL_NETWORK) == PackageManager.PERMISSION_GRANTED) return
    requestPermissions(arrayOf(LOCAL_NETWORK), LOCAL_NETWORK_REQUEST)
  }

  private companion object {
    const val LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK"
    const val LOCAL_NETWORK_REQUEST = 1
  }
}
