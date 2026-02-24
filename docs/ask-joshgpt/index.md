<script setup lang="ts">
import { computed, ref } from 'vue'

type AskSource = {
  title?: string
  route?: string
}

type AskPayload = {
  answer?: string
  sources?: AskSource[]
  model?: string
  error?: string
}

const question = ref('')
const answer = ref('')
const error = ref('')
const status = ref('')
const model = ref('')
const sources = ref<AskSource[]>([])
const isLoading = ref(false)

const characterCount = computed(() => question.value.length)
const canSubmit = computed(() => question.value.trim().length >= 3 && !isLoading.value)

async function submitQuestion() {
  const trimmed = question.value.trim()
  error.value = ''

  if (trimmed.length < 3) {
    error.value = 'Enter at least 3 characters.'
    return
  }

  isLoading.value = true
  status.value = 'Searching local site context...'
  answer.value = ''
  sources.value = []
  model.value = ''

  try {
    const response = await fetch('/api/ask-joshgpt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: trimmed })
    })

    const payload = (await response.json().catch(() => ({}))) as AskPayload
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`)
    }

    answer.value = String(payload.answer || '').trim()
    sources.value = Array.isArray(payload.sources) ? payload.sources : []
    model.value = String(payload.model || '')
    status.value = 'Done.'
  } catch (requestError) {
    const message = requestError instanceof Error ? requestError.message : 'Unexpected request error.'
    error.value = message
    status.value = ''
  } finally {
    isLoading.value = false
  }
}
</script>

# Ask JoshGPT

Ask questions about this site and public GitHub projects. Responses are grounded in local site content and project metadata.

<div class="jp-ask-shell">
  <label class="jp-ask-label" for="jp-ask-input">Question</label>
  <textarea
    id="jp-ask-input"
    v-model="question"
    class="jp-ask-input"
    rows="5"
    placeholder="Example: Which public repositories focus on automation and infrastructure?"
    @keydown.meta.enter.prevent="submitQuestion"
    @keydown.ctrl.enter.prevent="submitQuestion"
  />

  <div class="jp-ask-actions">
    <button class="jp-ask-button" :disabled="!canSubmit" @click="submitQuestion">
      {{ isLoading ? 'Thinking...' : 'Ask JoshGPT' }}
    </button>
    <span class="jp-ask-meta">{{ characterCount }} chars</span>
    <span class="jp-ask-meta" v-if="status">{{ status }}</span>
    <span class="jp-ask-meta" v-if="model">Model: {{ model }}</span>
  </div>

  <p v-if="error" class="jp-ask-error">{{ error }}</p>

  <div v-if="answer" class="jp-ask-answer-wrap">
    <h2 class="jp-ask-answer-title">Answer</h2>
    <pre class="jp-ask-answer">{{ answer }}</pre>

    <div v-if="sources.length" class="jp-ask-sources">
      <strong>Context Sources</strong>
      <ul>
        <li v-for="source in sources" :key="`${source.title || 'source'}-${source.route || ''}`">
          <a :href="source.route || '/'">{{ source.title || source.route || 'Source' }}</a>
        </li>
      </ul>
    </div>
  </div>
</div>

<style scoped>
.jp-ask-shell {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 1rem;
  background: var(--vp-c-bg-soft);
}

.jp-ask-label {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-size: 0.92rem;
  font-weight: 600;
}

.jp-ask-input {
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  line-height: 1.45;
  padding: 0.7rem 0.75rem;
  resize: vertical;
}

.jp-ask-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.7rem;
}

.jp-ask-button {
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  padding: 0.45rem 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.jp-ask-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.jp-ask-meta {
  color: var(--vp-c-text-2);
  font-size: 0.86rem;
}

.jp-ask-error {
  margin: 0.8rem 0 0;
  color: #b00020;
  font-weight: 600;
}

.jp-ask-answer-wrap {
  margin-top: 1rem;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 0.9rem;
}

.jp-ask-answer-title {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}

.jp-ask-answer {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.5;
}

.jp-ask-sources {
  margin-top: 0.9rem;
}

.jp-ask-sources ul {
  margin: 0.4rem 0 0;
  padding-left: 1rem;
}

@media (max-width: 640px) {
  .jp-ask-shell {
    padding: 0.8rem;
  }
}
</style>
