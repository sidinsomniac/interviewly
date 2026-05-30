// ============================================================
// Phase H — Mode B intro + consent scripts.
//
// MEDHA_INTRO_SPEECH      — spoken by the bot via /api/bot/speak right
//                           after it joins the meeting. Audio-only.
// MEDHA_CONSENT_CHAT_TEXT — markdown source-of-truth for the consent
//                           message. Edit this string when iterating.
// MEDHA_CONSENT_CHAT_HTML — hand-converted HTML that we actually POST
//                           via sendChatMessage (which takes HTML).
//                           Keep in sync with the markdown above when
//                           the wording changes.
//
// Placeholders — Sid will likely edit these as the demo settles.
// ============================================================

export const MEDHA_INTRO_SPEECH =
  `Hello, and welcome to this interview. I am Medha, your AI interviewer for ` +
  `today's session. I'll be guiding you through a series of technical questions ` +
  `about your role. Before we begin, please take a moment to read the consent ` +
  `message I have just posted in the chat. When you are ready to proceed, ` +
  `type "I agree" in the chat, and we will get started.`;

export const MEDHA_CONSENT_CHAT_TEXT = `Hi! I'm **Medha**, your AI interviewer.

Before we begin, please confirm the following:

- This interview will be recorded and the transcript will be used to evaluate your responses.
- I'll ask you questions one at a time. After each one, please type **"Done"** in this chat when you've finished your answer, and I'll move to the next question.
- If you need to think, that's fine — take your time.

To begin the interview, please type **"I agree"** in this chat.`;

export const MEDHA_CONSENT_CHAT_HTML =
  `<p>Hi! I'm <strong>Medha</strong>, your AI interviewer.</p>` +
  `<p>Before we begin, please confirm the following:</p>` +
  `<ul>` +
  `<li>This interview will be recorded and the transcript will be used to evaluate your responses.</li>` +
  `<li>I'll ask you questions one at a time. After each one, please type <strong>"Done"</strong> in this chat when you've finished your answer, and I'll move to the next question.</li>` +
  `<li>If you need to think, that's fine — take your time.</li>` +
  `</ul>` +
  `<p>To begin the interview, please type <strong>"I agree"</strong> in this chat.</p>`;
