export type DataOptionId = "audit_log" | "sheng_edge" | "nlg_grounded" | "custom_builder";

export interface TrainingDataOption {
  id: DataOptionId;
  label: string;
  subtitle: string;
  recommendedCount: string;
  sourceLocation: string;
  purpose: string;
  inputFormatSummary: string;
  fieldsCovered: string[];
  sampleUserPrompt: string;
  sampleAssistantOutput: string;
}

export interface TrainingStep {
  id: string;
  number: string;
  title: string;
  environment: "GPU Machine (RTX 3060+ / Colab / RunPod)" | "Local Laptop (CPU / Ollama)";
  estimatedTime: string;
  summary: string;
  details: string[];
  inputs: string;
  outputs: string;
  filename: string;
  language: string;
  script: string;
  pitfallNote: string;
}

export interface StarterSamplePair {
  id: string;
  task: "nlu" | "nlg";
  dialect: string;
  userMessage: string;
  assistantJsonOrReply: string;
  whyIncluded: string;
}

export const NLU_TRAINING_SYSTEM_PROMPT =
  "Extract Kenyan safari inquiry slots from English, Swahili, or mixed text.\n" +
  "Known circuits: Maasai Mara Classic, Amboseli Kilimanjaro Loop, Tsavo East & West Expedition, " +
  "Lake Nakuru Flamingo & Rift, Samburu Ewaso Nyiro Safari, Grand Rift & Mara Marathon.\n" +
  "Rules:\n" +
  "- If the user asks for an unrecognized park (e.g. Serengeti, Ngorongoro), keep that exact park name in circuit_name; NEVER substitute a different park.\n" +
  "- If no park or circuit is mentioned (e.g. a follow-up like '4 adults starting 2026-12-20'), set circuit_name to null.\n" +
  "- If only total people/pax are given (e.g. '10 people' or 'watu 10'), set adults to that number and children=0.\n" +
  "- Residency tiers: ea_citizen, ke_resident, af_citizen, non_resident (or null if unmentioned).\n" +
  "- Only set start_date if explicitly mentioned in ISO YYYY-MM-DD format.";

export const NLG_TRAINING_SYSTEM_PROMPT =
  "You are a helpful Nairobi safari dispatch coordinator writing a concise 2-3 sentence customer reply.\n" +
  "Rules:\n" +
  "1. Match the customer's language (English, Swahili, or polite bilingual EN/SW if mixed).\n" +
  "2. Use ONLY the verified numbers, dates, vehicle codes, guide names, booking ID, and status in GROUNDING_FACTS.\n" +
  "3. If status is 'confirmed', include the exact Booking #<booking_id> and exact USD total.\n" +
  "4. If status is 'rejected' due to an unknown circuit, include the phrase 'unknown circuit'.";

export const TRAINING_DATA_OPTIONS: TrainingDataOption[] = [
  {
    id: "audit_log",
    label: "Option A · Production audit_log",
    subtitle: "Real inquiries & manager-approved outcomes captured by this app",
    recommendedCount: "300–1,000+ rows",
    sourceLocation: "PostgreSQL / SQLite table: audit_log (node_name = 'intake' | 'finalizer')",
    purpose:
      "Exports real customer inquiries paired with verified slot JSON and grounded customer replies so the fine-tuned adapter reflects genuine agency phrasing.",
    inputFormatSummary:
      "ChatML JSONL with 3 messages per line: { messages: [{ role: 'system' }, { role: 'user' }, { role: 'assistant' }] }",
    fieldsCovered: [
      "intent, language, customer_name, circuit_name",
      "start_date (ISO), adults, children, infants_under_5",
      "residency_tier, prefer_senior_guide, discount_pct",
    ],
    sampleUserPrompt:
      "Niaje team, client wetu Safari Plains Ltd wanadai Maasai Mara Classic tarehe 2026-12-18 kwa watu wazima 6 na watoto 2, wote non-resident, tupe 10% discount tafadhali.",
    sampleAssistantOutput: JSON.stringify(
      {
        intent: "quote_request",
        language: "mixed",
        customer_name: "Safari Plains Ltd",
        circuit_name: "Maasai Mara Classic",
        start_date: "2026-12-18",
        adults: 6,
        children: 2,
        infants_under_5: 0,
        residency_tier: "non_resident",
        prefer_senior_guide: false,
        discount_pct: 10,
        missing_fields: [],
      },
      null,
      2
    ),
  },
  {
    id: "sheng_edge",
    label: "Option B · Curated Sheng & Edge Cases",
    subtitle: "Regional Nairobi slang, coastal Swahili, and negative boundary pairs",
    recommendedCount: "80–200 targeted rows",
    sourceLocation: "Handcrafted seed file: ml/data/sheng_edge_cases.jsonl",
    purpose:
      "Teaches the small 4B model local expressions ('wasee', 'mabeste', 'mtaa', 'mgeni', 'watoto wadogo') and enforces strict refusals on unsupported parks and slot-merge follow-ups.",
    inputFormatSummary:
      "Targeted NLU pairs covering slang counts, residency phrasing, infant exclusions, follow-up turns (circuit_name: null), and non-Kenyan parks.",
    fieldsCovered: [
      "Sheng group words ('wasee 5', 'mabeste 4', 'familia ya 6')",
      "Kenyan residency clues ('wakenya', 'mwananchi', 'permit ya Kenya')",
      "Unsupported parks kept literal ('Serengeti', 'Ngorongoro')",
    ],
    sampleUserPrompt:
      "Sasa boss, mabeste wangu 5 na watoi 2 (mmoja under 5) wanataka kushika Amboseli kuanzia 2026-11-22, sisi ni wakenya halisi, tupige na senior guide.",
    sampleAssistantOutput: JSON.stringify(
      {
        intent: "quote_request",
        language: "mixed",
        customer_name: null,
        circuit_name: "Amboseli Kilimanjaro Loop",
        start_date: "2026-11-22",
        adults: 5,
        children: 1,
        infants_under_5: 1,
        residency_tier: "ea_citizen",
        prefer_senior_guide: true,
        discount_pct: 0,
        missing_fields: [],
      },
      null,
      2
    ),
  },
  {
    id: "nlg_grounded",
    label: "Option C · Grounded Reply (NLG) Pairs",
    subtitle: "Teaches warm Swahili/Sheng/English replies strictly bound to SQL numbers",
    recommendedCount: "100–300 pairs",
    sourceLocation: "Derived from finalizer outcomes + GROUNDING_FACTS JSON",
    purpose:
      "Trains the model to draft natural Swahili or English customer confirmations without altering USD totals, KES figures, vehicle codes, or Booking #IDs.",
    inputFormatSummary:
      "User turn contains CUSTOMER_MESSAGE + GROUNDING_FACTS JSON; Assistant turn contains the verified 2-3 sentence reply.",
    fieldsCovered: [
      "Confirmed Booking #<id> & exact USD/KES totals",
      "Manager review hold notices without leaking internal SQL traces",
      "Explicit 'unknown circuit' notice when park is unsupported",
    ],
    sampleUserPrompt:
      "CUSTOMER_MESSAGE: Naomba bei ya Nakuru kwa wakenya 4 tarehe 2026-12-05.\nGROUNDING_FACTS:\n" +
      JSON.stringify(
        {
          status: "confirmed",
          customer_name: null,
          language: "sw",
          booking_id: 18,
          circuit_name: "Lake Nakuru Flamingo & Rift",
          start_date: "2026-12-05",
          end_date: "2026-12-06",
          total_pax: 4,
          vehicle_codes: ["LC-01"],
          guide_names: ["Peter Kamau"],
          quoted_total_usd: 940,
        },
        null,
        2
      ),
    sampleAssistantOutput:
      "Asante sana! Safari yako ya Lake Nakuru Flamingo & Rift kuanzia 2026-12-05 hadi 2026-12-06 kwa wageni 4 imethibitishwa kama Booking #18 (gari LC-01 na mwongozo Peter Kamau). Jumla ya gharama iliyohakikiwa ni $940.00.",
  },
];

export const STARTER_DATASET_PAIRS: StarterSamplePair[] = [
  {
    id: "sheng-mara-group",
    task: "nlu",
    dialect: "Nairobi Sheng + English",
    userMessage:
      "Oya dispatch, wasee 8 wa East Africa citizens wanadai kwenda Mara kuanzia 2026-12-10, tusort na punguzo ya 15%.",
    assistantJsonOrReply: JSON.stringify({
      intent: "quote_request",
      language: "mixed",
      customer_name: null,
      circuit_name: "Maasai Mara Classic",
      start_date: "2026-12-10",
      adults: 8,
      children: 0,
      infants_under_5: 0,
      residency_tier: "ea_citizen",
      prefer_senior_guide: false,
      discount_pct: 15,
      missing_fields: [],
    }),
    whyIncluded: "Maps 'wasee 8' -> adults: 8 and recognizes 15% discount needing manager sign-off.",
  },
  {
    id: "coastal-sw-family",
    task: "nlu",
    dialect: "Swahili (Coast / Standard)",
    userMessage:
      "Habari zenu, sisi ni familia ya wakazi wa Kenya: watu wazima 2, watoto 2 na mtoto mmoja chini ya miaka 5. Tunataka Tsavo tarehe 2026-08-14.",
    assistantJsonOrReply: JSON.stringify({
      intent: "quote_request",
      language: "sw",
      customer_name: null,
      circuit_name: "Tsavo East & West Expedition",
      start_date: "2026-08-14",
      adults: 2,
      children: 2,
      infants_under_5: 1,
      residency_tier: "ke_resident",
      prefer_senior_guide: false,
      discount_pct: 0,
      missing_fields: [],
    }),
    whyIncluded: "Separates 'wakazi wa Kenya' -> ke_resident and splits infants_under_5 from children.",
  },
  {
    id: "followup-null-circuit",
    task: "nlu",
    dialect: "Follow-up Turn (Slot Carry-Over)",
    userMessage: "Watu wazima 4 kuanzia 2026-12-20, na jina la mteja ni Kibo Ventures.",
    assistantJsonOrReply: JSON.stringify({
      intent: "quote_request",
      language: "sw",
      customer_name: "Kibo Ventures",
      circuit_name: null,
      start_date: "2026-12-20",
      adults: 4,
      children: 0,
      infants_under_5: 0,
      residency_tier: null,
      prefer_senior_guide: false,
      discount_pct: 0,
      missing_fields: [],
    }),
    whyIncluded: "Trains model to leave circuit_name as null so the workflow merges the previous turn's park.",
  },
  {
    id: "unsupported-park-literal",
    task: "nlu",
    dialect: "Out-of-Catalog Guardrail",
    userMessage: "Can you book 4 adults to Serengeti starting 2026-09-12?",
    assistantJsonOrReply: JSON.stringify({
      intent: "quote_request",
      language: "en",
      customer_name: null,
      circuit_name: "Serengeti",
      start_date: "2026-09-12",
      adults: 4,
      children: 0,
      infants_under_5: 0,
      residency_tier: null,
      prefer_senior_guide: false,
      discount_pct: 0,
      missing_fields: [],
    }),
    whyIncluded: "Prevents silent substitution to Maasai Mara so Policy Critic rejects Serengeti cleanly.",
  },
  {
    id: "grounded-sw-confirmation",
    task: "nlg",
    dialect: "Grounded Swahili Confirmation",
    userMessage:
      "CUSTOMER_MESSAGE: Tunataka Samburu watu 2 kuanzia 2026-11-28.\nGROUNDING_FACTS:\n" +
      JSON.stringify({
        status: "confirmed",
        customer_name: null,
        language: "sw",
        booking_id: 24,
        circuit_name: "Samburu Ewaso Nyiro Safari",
        start_date: "2026-11-28",
        end_date: "2026-11-30",
        total_pax: 2,
        vehicle_codes: ["LC-02"],
        guide_names: ["Grace Muthoni"],
        quoted_total_usd: 2180,
      }),
    assistantJsonOrReply:
      "Karibu! Safari yako ya Samburu Ewaso Nyiro Safari (2026-11-28 hadi 2026-11-30) kwa wageni 2 imethibitishwa kama Booking #24 na gari LC-02 chini ya mwongozo Grace Muthoni. Jumla ya malipo ni $2,180.00.",
    whyIncluded: "Reinforces preserving exact Booking #24 and $2,180.00 anchors in natural Swahili.",
  },
];

export function buildChatMlJsonlLine(pair: {
  task: "nlu" | "nlg";
  userMessage: string;
  assistantOutput: string;
}): string {
  const systemPrompt = pair.task === "nlu" ? NLU_TRAINING_SYSTEM_PROMPT : NLG_TRAINING_SYSTEM_PROMPT;
  return JSON.stringify({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: pair.userMessage.trim() },
      { role: "assistant", content: pair.assistantOutput.trim() },
    ],
  });
}

export function buildStarterDatasetJsonl(): string {
  return STARTER_DATASET_PAIRS.map((item) =>
    buildChatMlJsonlLine({
      task: item.task,
      userMessage: item.userMessage,
      assistantOutput: item.assistantJsonOrReply,
    })
  ).join("\n");
}

export const TRAINING_STEPS: TrainingStep[] = [
  {
    id: "step-01-env",
    number: "Step 01",
    title: "Provision GPU & Install QLoRA Environment",
    environment: "GPU Machine (RTX 3060+ / Colab / RunPod)",
    estimatedTime: "5–10 min",
    summary:
      "Prepare a CUDA Python environment on a machine with at least 8–12 GB VRAM. Unsloth cuts Qwen3-4B QLoRA memory usage in half and exports straight to Ollama GGUF.",
    details: [
      "Recommended cloud options when laptop lacks GPU: Google Colab (T4 16 GB free/Pro), RunPod (RTX 4090 ~$0.34/hr), or Lambda/Modal.",
      "Do NOT install GPU training libraries inside the Safari Dispatch Node container; keep this isolated in a `ml-train/` folder on the GPU box.",
      "Verify CUDA is visible via `nvidia-smi` before running `train_lora.py`.",
    ],
    inputs: "NVIDIA GPU (8 GB+ VRAM), Python 3.10–3.12, CUDA 12.1+",
    outputs: "Ready virtualenv with unsloth, trl, peft, bitsandbytes, and database drivers",
    filename: "01_setup_gpu_env.sh",
    language: "bash",
    script: `# 1. Verify NVIDIA GPU and available VRAM (need >= 8 GB for QLoRA 4-bit)
nvidia-smi

# 2. Create isolated Python virtual environment
python3 -m venv .venv-lora
source .venv-lora/bin/activate

# 3. Install Unsloth + TRL + PEFT + GGUF converter + Postgres/JSON tools
pip install --upgrade pip
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps trl peft accelerate bitsandbytes
pip install "psycopg[binary]" jsonschema datasets`,
    pitfallNote:
      "If using an older Turing GPU (Colab T4 / RTX 2060), QLoRA runs in fp16 automatically. Ampere+ (RTX 3060/4070/L4) unlocks bf16 for faster convergence.",
  },
  {
    id: "step-02-export",
    number: "Step 02",
    title: "Export Inquiry Transcripts & Merge Sheng Dataset",
    environment: "GPU Machine (RTX 3060+ / Colab / RunPod)",
    estimatedTime: "2–5 min",
    summary:
      "Extract real validated user_message + slots pairs from workflow_checkpoints and pending_approvals (PostgreSQL or SQLite), merge them with curated Sheng/Swahili edge cases, validate JSON keys, and split 90/10 into train/eval JSONL.",
    details: [
      "Reads real conversation states from `workflow_checkpoints.state_json` (which stores both `user_message` and `slots`) as well as manager-reviewed rows in `pending_approvals`.",
      "Keep at least 15–20% of your rows on edge cases: unrecognized parks (`Serengeti`), follow-ups (`circuit_name: null`), and infant-under-5 splits.",
      "Never include synthetic rows with guessed prices; pricing comes exclusively from PostgreSQL/SQLite.",
    ],
    inputs: "PostgreSQL (safari_dispatch) or SQLite (data/checkpoints.db + data/safari_dispatch.db) + sheng_seed.jsonl",
    outputs: "data/train.jsonl (90%) and data/eval.jsonl (10%)",
    filename: "02_export_dataset.py",
    language: "python",
    script: `import json, os, random, sqlite3
from pathlib import Path

NLU_SYSTEM = """${NLU_TRAINING_SYSTEM_PROMPT.replace(/`/g, "\\`")}"""

REQUIRED_KEYS = (
    "intent", "language", "customer_name", "circuit_name", "start_date",
    "adults", "children", "infants_under_5", "residency_tier",
    "prefer_senior_guide", "discount_pct", "missing_fields",
)

def build_nlu_row(user_message: str, slots: dict):
    cleaned = {k: slots.get(k) for k in REQUIRED_KEYS}
    return {
        "messages": [
            {"role": "system", "content": NLU_SYSTEM},
            {"role": "user", "content": user_message.strip()},
            {"role": "assistant", "content": json.dumps(cleaned, ensure_ascii=False)},
        ]
    }

def load_from_sqlite(checkpoints_db: str, dispatch_db: str):
    rows = []
    if Path(checkpoints_db).exists():
        conn = sqlite3.connect(checkpoints_db)
        for (state_raw,) in conn.execute("SELECT state_json FROM workflow_checkpoints"):
            st = json.loads(state_raw)
            if st.get("user_message") and isinstance(st.get("slots"), dict):
                rows.append(build_nlu_row(st["user_message"], st["slots"]))
        conn.close()
    if Path(dispatch_db).exists():
        conn = sqlite3.connect(dispatch_db)
        for msg, slots_raw in conn.execute("SELECT user_message, slots_json FROM pending_approvals"):
            if msg and slots_raw:
                rows.append(build_nlu_row(msg, json.loads(slots_raw)))
        conn.close()
    return rows

def load_from_postgres(dsn: str):
    import psycopg
    rows = []
    with psycopg.connect(dsn) as conn:
        for (state_raw,) in conn.execute("SELECT state_json FROM workflow_checkpoints"):
            st = json.loads(state_raw)
            if st.get("user_message") and isinstance(st.get("slots"), dict):
                rows.append(build_nlu_row(st["user_message"], st["slots"]))
        for msg, slots_raw in conn.execute("SELECT user_message, slots_json FROM pending_approvals"):
            if msg and slots_raw:
                rows.append(build_nlu_row(msg, json.loads(slots_raw)))
    return rows

def main():
    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)
    examples = []

    pg_dsn = os.getenv("DATABASE_URL")  # e.g. postgresql://safari:safari_dev@localhost:5432/safari_dispatch
    if pg_dsn:
        examples.extend(load_from_postgres(pg_dsn))
    else:
        examples.extend(load_from_sqlite("data/checkpoints.db", "data/safari_dispatch.db"))

    seed_file = Path("sheng_seed.jsonl")
    if seed_file.exists():
        for line in seed_file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                examples.append(json.loads(line))

    # Deduplicate by user message before splitting
    dedup = {}
    for ex in examples:
        dedup[ex["messages"][1]["content"]] = ex
    unique_rows = list(dedup.values())

    random.seed(42)
    random.shuffle(unique_rows)
    split_idx = max(1, int(len(unique_rows) * 0.9))
    train_rows, eval_rows = unique_rows[:split_idx], unique_rows[split_idx:]

    (out_dir / "train.jsonl").write_text(
        "\\n".join(json.dumps(r, ensure_ascii=False) for r in train_rows), encoding="utf-8"
    )
    (out_dir / "eval.jsonl").write_text(
        "\\n".join(json.dumps(r, ensure_ascii=False) for r in eval_rows), encoding="utf-8"
    )
    print(f"Exported {len(train_rows)} train rows and {len(eval_rows)} eval rows.")

if __name__ == "__main__":
    main() `,
    pitfallNote:
      "Always deduplicate identical inquiries before the 90/10 split so evaluation metrics measure real generalization instead of memorized prompt leaks.",
  },
  {
    id: "step-03-train",
    number: "Step 03",
    title: "Run QLoRA Fine-Tuning on Qwen3-4B",
    environment: "GPU Machine (RTX 3060+ / Colab / RunPod)",
    estimatedTime: "10–25 min",
    summary:
      "Attach low-rank LoRA adapters (rank 16) to attention and MLP layers of Qwen/Qwen3-4B while keeping base weights frozen in 4-bit NF4. Loss is computed only on assistant outputs.",
    details: [
      "Training only ~1.5% of parameters prevents catastrophic forgetting of Qwen3's English/JSON instruction following.",
      "Keep epochs modest (3 epochs over 300–800 examples) so the model does not overfit to specific customer names or dates.",
      "With `unsloth.chat_templates.train_on_responses_only`, gradients ignore the long system prompt and focus strictly on slot JSON + Swahili phrasing.",
    ],
    inputs: "Qwen/Qwen3-4B base weights + data/train.jsonl",
    outputs: "outputs/safari-lora-adapter/ (merged Hugging Face LoRA adapter weights)",
    filename: "03_train_lora.py",
    language: "python",
    script: `import torch
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from unsloth import FastLanguageModel, is_bfloat16_supported
from unsloth.chat_templates import get_chat_template, train_on_responses_only

MODEL_ID = "Qwen/Qwen3-4B"
MAX_SEQ_LEN = 2048

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_ID,
    max_seq_length=MAX_SEQ_LEN,
    dtype=None,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_alpha=32,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

def format_prompts(batch):
    texts = [
        tokenizer.apply_chat_template(
            msgs, tokenize=False, add_generation_prompt=False
        )
        for msgs in batch["messages"]
    ]
    return {"text": texts}

dataset = load_dataset("json", data_files={"train": "data/train.jsonl"})["train"]
dataset = dataset.map(format_prompts, batched=True)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LEN,
    args=SFTConfig(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        num_train_epochs=3,
        learning_rate=2e-4,
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        logging_steps=5,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        output_dir="outputs/checkpoints",
    ),
)

trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\\n",
    response_part="<|im_start|>assistant\\n",
)
trainer.train()

model.save_pretrained("outputs/safari-lora-adapter")
tokenizer.save_pretrained("outputs/safari-lora-adapter")
print("Saved LoRA adapter to outputs/safari-lora-adapter")`,
    pitfallNote:
      "Watch `loss` over epochs: healthy JSON extraction starts around 0.8–1.2 and settles near 0.15–0.30. If loss drops below 0.05, lower epochs or add more diverse phrasing.",
  },
  {
    id: "step-04-gguf",
    number: "Step 04",
    title: "Merge Adapter & Quantize to GGUF (Q4_K_M)",
    environment: "GPU Machine (RTX 3060+ / Colab / RunPod)",
    estimatedTime: "3–6 min",
    summary:
      "Merge the trained LoRA weights back into Qwen3-4B and convert to a single ~2.5 GB Q4_K_M GGUF file so your regular laptop can run it via Ollama without needing a GPU anymore.",
    details: [
      "`q4_k_m` preserves near-FP16 JSON Schema fidelity while fitting comfortably in ~4 GB RAM on CPU or Apple Silicon / lightweight GPUs.",
      "Once exported, copy only the single `.gguf` file back to your laptop.",
    ],
    inputs: "outputs/safari-lora-adapter/",
    outputs: "safari-dispatch-qwen3-q4_k_m.gguf (~2.5 GB single file)",
    filename: "04_export_gguf.py",
    language: "python",
    script: `from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="outputs/safari-lora-adapter",
    max_seq_length=2048,
    dtype=None,
    load_in_4bit=True,
)

# Merge LoRA + base weights and quantize directly for Ollama
model.save_pretrained_gguf(
    "outputs/gguf",
    tokenizer,
    quantization_method="q4_k_m",
)
print("GGUF ready in outputs/gguf/unsloth.Q4_K_M.gguf")`,
    pitfallNote:
      "Avoid overly aggressive 2-bit quantization (`q2_k`)—structured JSON punctuation (`null`, brackets, ISO dates) degrades sharply below 4-bit.",
  },
  {
    id: "step-05-ollama",
    number: "Step 05",
    title: "Register Custom Model in Local Ollama",
    environment: "Local Laptop (CPU / Ollama)",
    estimatedTime: "1 min",
    summary:
      "Create an Ollama Modelfile pointing to your quantized GGUF with `temperature 0`, Qwen chat stops, and register it locally as `safari-dispatch-qwen3:4b`.",
    details: [
      "Keeping `temperature 0` and `<|im_end|>` stops guarantees deterministic JSON output compatible with Safari Dispatch's `format: SLOT_JSON_SCHEMA` call.",
      "Your fine-tuned model lives side-by-side with stock `qwen3:4b`, making A/B boardroom demos trivial.",
    ],
    inputs: "safari-dispatch-qwen3-q4_k_m.gguf + Modelfile",
    outputs: "Local Ollama model tag: safari-dispatch-qwen3:4b",
    filename: "Modelfile",
    language: "dockerfile",
    script: `# Save as Modelfile next to your downloaded GGUF on your laptop
FROM ./unsloth.Q4_K_M.gguf

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- range .Messages }}{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ .Content }}<|im_end|>
{{ end }}{{- end }}<|im_start|>assistant
"""

PARAMETER temperature 0
PARAMETER num_ctx 4096
PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"

# Register inside local Ollama (run in terminal):
# ollama create safari-dispatch-qwen3:4b -f Modelfile`,
    pitfallNote:
      "Ensure the `TEMPLATE` block matches Qwen's `<|im_start|>`/`<|im_end|>` tags used during training in Step 03—template mismatches are the #1 cause of garbled fine-tuned outputs.",
  },
  {
    id: "step-06-eval-switch",
    number: "Step 06",
    title: "Benchmark vs. Base Model & Activate in .env",
    environment: "Local Laptop (CPU / Ollama)",
    estimatedTime: "2–3 min",
    summary:
      "Evaluate held-out eval.jsonl accuracy between base qwen3:4b and safari-dispatch-qwen3:4b, then point `.env` to the fine-tuned tag. Zero TypeScript code changes required.",
    details: [
      "Measure four concrete metrics on `eval.jsonl`: Valid JSON %, Exact Slot Accuracy %, Unknown Park Preservation %, and Grounded Reply Pass Rate.",
      "Once validated, update `OLLAMA_MODEL` in `.env` and restart `npm run dev`—the AI Pipeline inspector on Quotes & Approvals will immediately show `Local Ollama (safari-dispatch-qwen3:4b)`.",
    ],
    inputs: "data/eval.jsonl + .env",
    outputs: "Verified model swap in Safari Dispatch OS",
    filename: "06_activate_model.sh",
    language: "bash",
    script: `# 1. Register the downloaded GGUF in Ollama (if not already run)
ollama create safari-dispatch-qwen3:4b -f Modelfile

# 2. Smoke test with strict JSON extraction
ollama run safari-dispatch-qwen3:4b "Wasee 6 wa Kenya wanadai Mara tarehe 2026-12-20"

# 3. Point Safari Dispatch OS at your custom fine-tuned model in .env:
# USE_DETERMINISTIC_LLM=0
# OLLAMA_BASE_URL="http://localhost:11434"
# OLLAMA_MODEL="safari-dispatch-qwen3:4b"

# 4. Run preflight + full automated test suite
npm run check:local
npm test`,
    pitfallNote:
      "Keep deterministic pricing and booking locks untouched in TypeScript/PostgreSQL—your fine-tuned LoRA should improve NLU slot accuracy and Swahili/Sheng tone, never replace SQL math.",
  },
];
