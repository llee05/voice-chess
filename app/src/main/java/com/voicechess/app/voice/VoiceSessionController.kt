package com.voicechess.app.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.voicechess.core.VoiceCommand
import com.voicechess.core.VoiceCommandParser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

enum class VoicePhase { IDLE, LISTENING, PROCESSING, SPEAKING }

data class VoiceState(
    val available: Boolean,
    val onDevice: Boolean,
    val active: Boolean = false,
    val phase: VoicePhase = VoicePhase.IDLE,
    val transcript: String = "",
    val detail: String = "Start a voice session when you're ready.",
)

/** Main-thread owner of short recognition turns and TTS; no background recording. */
class VoiceSessionController(context: Context, private val onTranscript: (String) -> String) {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val parser = VoiceCommandParser()
    private val onDeviceAvailable = Build.VERSION.SDK_INT >= 31 &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(appContext)
    private val _state = MutableStateFlow(VoiceState(
        available = onDeviceAvailable || SpeechRecognizer.isRecognitionAvailable(appContext),
        onDevice = onDeviceAvailable,
    ))
    val state = _state.asStateFlow()
    private var recognizer: SpeechRecognizer? = null
    private var acceptingResults = false
    private var closed = false
    private var ttsReady = false
    private var ttsInitialized = false
    private var pendingSpeech: String? = null
    private var silenceCount = 0
    private var utteranceId = 0
    private var currentUtterance = ""
    private val timeout = Runnable { pause("Session paused after two minutes. Tap Start voice to continue.") }
    private val listenAgain = Runnable { listen() }
    private val speechTimeout = Runnable {
        currentUtterance = ""
        tts.stop()
        pause("Spoken feedback timed out. Tap Start voice to try again, or type a move.")
    }

    private lateinit var tts: TextToSpeech

    init {
        tts = TextToSpeech(appContext) { status ->
            handler.post {
                if (!closed) {
                    ttsInitialized = true
                    ttsReady = status == TextToSpeech.SUCCESS
                    if (ttsReady) {
                        val language = tts.setLanguage(Locale.UK)
                        ttsReady = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED
                        tts.setSpeechRate(0.9f)
                    }
                    pendingSpeech?.let { pendingSpeech = null; speak(it) }
                }
            }
        }
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) = finishSpeech(utteranceId)
            @Deprecated("Android callback")
            override fun onError(utteranceId: String?) = finishSpeech(utteranceId)
        })
    }

    private fun finishSpeech(id: String?) {
        handler.post {
            if (!closed && id == currentUtterance) {
                handler.removeCallbacks(speechTimeout)
                currentUtterance = ""
                if (_state.value.active) handler.postDelayed(listenAgain, 350)
                else _state.value = _state.value.copy(phase = VoicePhase.IDLE)
            }
        }
    }

    fun start(introduction: String) {
        if (closed) return
        if (!_state.value.available) {
            pause("No speech recognition service is installed. You can type a move below.")
            return
        }
        silenceCount = 0
        _state.value = _state.value.copy(active = true, detail = "Voice session starting…")
        handler.removeCallbacks(timeout)
        handler.postDelayed(timeout, 120_000)
        speak(introduction)
    }

    fun respond(message: String) {
        if (_state.value.active) speak(message)
    }

    fun permissionDenied() = pause("Microphone access is needed for voice. Enable it in app settings, or type a move below.")

    fun pause(message: String = "Voice paused. Tap Start voice to continue.") {
        if (closed) return
        acceptingResults = false
        pendingSpeech = null
        currentUtterance = ""
        handler.removeCallbacks(timeout)
        handler.removeCallbacks(listenAgain)
        handler.removeCallbacks(speechTimeout)
        _state.value = _state.value.copy(active = false, phase = VoicePhase.IDLE, detail = message)
        recognizer?.cancel()
        tts.stop()
    }

    fun close() {
        pause()
        closed = true
        handler.removeCallbacksAndMessages(null)
        recognizer?.destroy()
        recognizer = null
        tts.shutdown()
    }

    private fun speak(message: String) {
        if (closed) return
        acceptingResults = false
        handler.removeCallbacks(listenAgain)
        handler.removeCallbacks(speechTimeout)
        recognizer?.cancel()
        if (!ttsInitialized) {
            pendingSpeech = message
            _state.value = _state.value.copy(phase = VoicePhase.SPEAKING, detail = "Preparing spoken feedback…")
            handler.postDelayed(speechTimeout, 15_000)
            return
        }
        if (!ttsReady) {
            // Keep visible feedback and recognition usable even without an English TTS voice.
            _state.value = _state.value.copy(detail = "English spoken feedback is unavailable. Read the feedback on screen.")
            handler.postDelayed(listenAgain, 350)
            return
        }
        _state.value = _state.value.copy(phase = VoicePhase.SPEAKING, detail = "Speaking… Your microphone is paused.")
        currentUtterance = "voice-chess-${++utteranceId}"
        val result = tts.speak(message, TextToSpeech.QUEUE_FLUSH, null, currentUtterance)
        if (result == TextToSpeech.ERROR) finishSpeech(currentUtterance)
        else handler.postDelayed(speechTimeout, 60_000)
    }

    private fun createRecognizer(): SpeechRecognizer {
        val instance = if (Build.VERSION.SDK_INT >= 31 && _state.value.onDevice) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(appContext)
        } else SpeechRecognizer.createSpeechRecognizer(appContext)
        instance.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                if (acceptingResults) _state.value = _state.value.copy(phase = VoicePhase.LISTENING, detail = "Listening… Say your move.")
            }
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() {
                if (acceptingResults) _state.value = _state.value.copy(phase = VoicePhase.PROCESSING, detail = "Understanding your move…")
            }
            override fun onError(error: Int) {
                if (!acceptingResults || closed || !_state.value.active) return
                acceptingResults = false
                if (_state.value.onDevice && error in listOf(SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
                    recognizer?.destroy()
                    recognizer = null
                    _state.value = _state.value.copy(onDevice = false)
                    if (SpeechRecognizer.isRecognitionAvailable(appContext)) {
                        speak("On-device English recognition is unavailable. Switching to your device's speech service, which may use the internet.")
                        return
                    }
                }
                if (error in listOf(SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT) && ++silenceCount < 2) {
                    speak("I didn't catch that. Please say your move again.")
                    return
                }
                pause(when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is missing. Enable it in app settings."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech service couldn't connect. Check your connection, or type a move."
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected. Tap Start voice when you're ready."
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech service is busy. Wait a moment, then tap Start voice."
                    else -> "Speech recognition is unavailable right now. Tap Start voice to retry, or type a move."
                })
            }
            override fun onResults(results: Bundle?) {
                if (!acceptingResults || closed || !_state.value.active) return
                acceptingResults = false
                silenceCount = 0
                val transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                _state.value = _state.value.copy(transcript = transcript)
                val message = onTranscript(transcript)
                if (parser.parse(transcript) == VoiceCommand.Stop) pause("Voice session paused.")
                else speak(message)
            }
            override fun onPartialResults(partialResults: Bundle?) = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        return instance
    }

    private fun listen() {
        if (closed || !_state.value.active) return
        try {
            val engine = recognizer ?: createRecognizer().also { recognizer = it }
            acceptingResults = true
            _state.value = _state.value.copy(phase = VoicePhase.LISTENING, detail = "Listening… Say your move.")
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            })
        } catch (_: SecurityException) {
            permissionDenied()
        } catch (_: RuntimeException) {
            pause("Couldn't start the speech service. You can type a move below.")
        }
    }
}
