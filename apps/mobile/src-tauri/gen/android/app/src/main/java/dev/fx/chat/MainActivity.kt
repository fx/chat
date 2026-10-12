package dev.fx.chat

import android.app.Activity
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  /** A spoken prompt the web app has not taken yet. */
  private var assistPrompt: String? = null

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
    if (savedInstanceState == null) handleAssist(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleAssist(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(AssistBridge(), "FxAssist")
  }

  /**
   * As the device's digital assistant, the system starts this activity with
   * ACTION_ASSIST (long-press power, corner swipe; hotwords stay Google's).
   * Listen for one utterance, then hand it to the web app, which starts a new
   * conversation with it.
   */
  private fun handleAssist(intent: Intent?) {
    val action = intent?.action
    if (action != Intent.ACTION_ASSIST && action != Intent.ACTION_VOICE_COMMAND) return
    val listen = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask anything")
    try {
      launchActivityForResult(listen) { result ->
        val text = result
          ?.takeIf { it.resultCode == Activity.RESULT_OK }
          ?.data
          ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
          ?.firstOrNull()
          ?.trim()
        if (!text.isNullOrEmpty()) deliverPrompt(text)
      }
    } catch (_: ActivityNotFoundException) {
      // No speech recognizer: the app just opens.
    }
  }

  /** Park the prompt for the web app and tell it one is waiting. */
  private fun deliverPrompt(text: String) {
    synchronized(this) { assistPrompt = text }
    webView?.post {
      webView?.evaluateJavascript("window.dispatchEvent(new Event('fx-assist'))", null)
    }
  }

  /** `window.FxAssist` in the web app. */
  private inner class AssistBridge {
    /** The waiting spoken prompt, once; null when there is none. */
    @JavascriptInterface
    fun takePrompt(): String? = synchronized(this@MainActivity) {
      assistPrompt.also { assistPrompt = null }
    }

    /** Whether this app holds the assistant role. */
    @JavascriptInterface
    fun isAssistant(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
      val roles = getSystemService(RoleManager::class.java) ?: return false
      return roles.isRoleHeld(RoleManager.ROLE_ASSISTANT)
    }

    /** Open the system's digital-assistant picker. */
    @JavascriptInterface
    fun openAssistantSettings() {
      runOnUiThread {
        try {
          startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS))
        } catch (_: ActivityNotFoundException) {
          startActivity(Intent(Settings.ACTION_SETTINGS))
        }
      }
    }
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
