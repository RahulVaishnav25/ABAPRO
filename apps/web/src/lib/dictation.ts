import { onBeforeUnmount, ref } from 'vue';

// The Web Speech API is not in TypeScript's DOM library yet; these are the parts used here.
interface SpeechResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
}
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognizerClass = new () => SpeechRecognizer;

function recognizerClass(): SpeechRecognizerClass | null {
  const scope = window as unknown as { SpeechRecognition?: SpeechRecognizerClass; webkitSpeechRecognition?: SpeechRecognizerClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow microphone access in the browser to dictate.',
  'service-not-allowed': 'Allow microphone access in the browser to dictate.',
  'audio-capture': 'No microphone was found.',
  network: 'Dictation needs a network connection in this browser.',
};

/**
 * Speech to text with the browser's own recogniser. Each finished phrase is passed to `onText`; the phrase still being
 * spoken is in `interim`. Browsers that lack the API report `supported` as false.
 */
export function useDictation(onText: (text: string) => void) {
  const Recognizer = recognizerClass();
  const supported = Recognizer !== null;
  const listening = ref(false);
  const interim = ref('');
  const error = ref('');
  let recognizer: SpeechRecognizer | null = null;

  function start(): void {
    if (!Recognizer || listening.value) return;
    error.value = '';
    recognizer = new Recognizer();
    recognizer.lang = document.documentElement.lang || navigator.language || 'en-US';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      let pending = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) onText(result[0].transcript.trim());
        else pending += result[0].transcript;
      }
      interim.value = pending;
    };
    recognizer.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') error.value = ERRORS[event.error] ?? 'Dictation stopped. Try again.';
    };
    recognizer.onend = () => {
      listening.value = false;
      interim.value = '';
    };
    recognizer.start();
    listening.value = true;
  }

  function stop(): void {
    recognizer?.stop();
  }

  onBeforeUnmount(stop);
  return { supported, listening, interim, error, start, stop };
}
