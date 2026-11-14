let utterance: SpeechSynthesisUtterance | null = null

export function isSpeaking(): boolean {
  return Boolean(window.speechSynthesis?.speaking)
}

export function stopSpeech(): void {
  utterance = null
  window.speechSynthesis?.cancel()
}

export function speak(text: string): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  synth.cancel()
  const next = new SpeechSynthesisUtterance(text)
  const chinese = /[\u3400-\u9fff]/.test(text)
  next.lang = chinese ? 'zh-CN' : 'en-US'
  const voices = synth.getVoices()
  const voice = voices.find((candidate) => candidate.lang.toLowerCase().startsWith(chinese ? 'zh' : 'en'))
  if (voice) next.voice = voice
  next.rate = 1
  next.onend = () => {
    if (utterance === next) utterance = null
  }
  utterance = next
  synth.speak(next)
  return true
}
