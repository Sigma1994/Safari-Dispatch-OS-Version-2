export interface GuideSubSection {
  heading: string;
  body: string[];
  codeExample?: {
    title: string;
    fileRef: string;
    snippet: string;
  };
  formulaBox?: {
    label: string;
    expression: string;
    explanation: string;
  };
}

export interface GuideChapter {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  readingMinutes: number;
  aiConcepts: string[];
  backendComponents: string[];
  executiveSummary: string;
  businessImpactMetric: string;
  visualId?: "pipeline" | "nlu_decoding" | "pricing_allocation" | "concurrency_toctou" | "qlora_adapters";
  beginnerAnalogy: string;
  sections: GuideSubSection[];
  keyTakeaways: string[];
}

export interface TechStackRow {
  layer: string;
  technology: string;
  category: "AI / ML" | "Orchestration" | "Backend / DB" | "Guardrail";
  roleInApp: string;
  whyChosen: string;
}

export interface GlossaryEntry {
  term: string;
  plainMeaning: string;
  whereUsed: string;
}

export const TECH_STACK_MATRIX: TechStackRow[] = [
  {
    layer: "Local LLM Runtime",
    technology: "Ollama + Qwen3-4B (4-bit Q4_K_M GGUF)",
    category: "AI / ML",
    roleInApp: "Parses messy English/Swahili inquiries into JSON and drafts bilingual customer replies.",
    whyChosen: "Runs offline on a laptop or office server with zero per-token API cost and full client data privacy.",
  },
  {
    layer: "Structured NLU",
    technology: "Constrained JSON Schema Decoding (T = 0)",
    category: "AI / ML",
    roleInApp: "Forces the LLM to output valid InquirySlots fields with exact types and enums.",
    whyChosen: "Eliminates malformed JSON crashes and prevents invented field names during extraction.",
  },
  {
    layer: "Deterministic Fallback NLU",
    technology: "Lexicon & Regex Parser",
    category: "Guardrail",
    roleInApp: "Extracts parks, guest counts, dates, and residency tiers when Ollama is unreachable.",
    whyChosen: "Guarantees 100% uptime even on machines where no AI model server is currently running.",
  },
  {
    layer: "Workflow Orchestrator",
    technology: "LangGraph StateGraph (Python) & Stateful Workflow Engine (TypeScript)",
    category: "Orchestration",
    roleInApp: "Connects Intake, Clarification, Specialist Pricing, Policy Critic, HITL Interrupt, and Finalizer.",
    whyChosen: "Supports cyclic retries, persistent thread memory, and human pause/resume checkpoints.",
  },
  {
    layer: "HTTP & Concurrency Layer",
    technology: "Express (Node 22) / FastAPI (Python 3.11) + Idempotency Keys",
    category: "Backend / DB",
    roleInApp: "Exposes REST endpoints, deduplicates double-clicks, and coordinates async workflow execution.",
    whyChosen: "Sub-millisecond routing with strict request validation and safe retry semantics.",
  },
  {
    layer: "Pricing & Fleet Engine",
    technology: "Deterministic SQL + Greedy Bin-Packing Algorithm",
    category: "Backend / DB",
    roleInApp: "Calculates park fees (KES/USD), lodge nights, vehicle seats, and guide assignments.",
    whyChosen: "LLMs hallucinate arithmetic; exact financial calculations must always live in deterministic code.",
  },
  {
    layer: "Storage & Anti-Double-Booking",
    technology: "PostgreSQL 16 (SERIALIZABLE + btree_gist) & SQLite (BEGIN IMMEDIATE WAL)",
    category: "Backend / DB",
    roleInApp: "Enforces database-level exclusion locks on vehicle and guide date ranges.",
    whyChosen: "Prevents TOCTOU race conditions where two coordinators confirm the same Land Cruiser simultaneously.",
  },
  {
    layer: "NLG Output Verifier",
    technology: "Programmatic Grounding Guardrail (verifyGroundedReply)",
    category: "Guardrail",
    roleInApp: "Checks generated replies for exact Booking IDs, USD totals, and unknown-park disclaimers.",
    whyChosen: "Stops an LLM from accidentally rounding prices or omitting mandatory confirmation numbers.",
  },
  {
    layer: "Optional Specialization",
    technology: "QLoRA (4-bit NF4 Base + Rank-16 LoRA Adapters)",
    category: "AI / ML",
    roleInApp: "Optional future fine-tuning on Sheng slang and Nairobi dispatch audit logs.",
    whyChosen: "Adapts a 4B parameter model on a single consumer GPU by updating less than 2% of weights.",
  },
];

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: "problem-and-neurosymbolic",
    number: "01",
    title: "The Business Problem & Why Neuro-Symbolic AI Solves It",
    subtitle: "Understanding why Kenyan safari quoting breaks both traditional software and standalone chatbots.",
    readingMinutes: 4,
    aiConcepts: ["Neuro-Symbolic AI", "Hallucination vs. Grounding", "Separation of Concerns"],
    backendComponents: ["Inquiry Lifecycle", "Deterministic Tool Boundary"],
    executiveSummary:
      "Tour operators receive messy multi-language messages on WhatsApp and email, yet pricing and vehicle availability follow strict financial and legal rules. Pure chatbots invent prices and double-book Land Cruisers; pure forms frustrate travelers. Safari Dispatch OS pairs an AI language interpreter with an infallible mathematical and database core.",
    businessImpactMetric: "Zero invented prices · Zero double-booked vehicles · Bilingual EN/SW comprehension",
    visualId: "pipeline",
    beginnerAnalogy:
      "Think of a brilliant bilingual receptionist (the AI model) sitting next to a strict chief accountant with a locked ledger (the backend code). The receptionist translates what the customer wants into a neat order slip; only the accountant calculates the bill, checks the garage keys, and stamps the receipt.",
    sections: [
      {
        heading: "Why Kenyan Safari Dispatch Is Surprisingly Hard",
        body: [
          "At first glance, quoting a safari sounds like simple multiplication. In practice, Kenyan safari operations sit at the intersection of messy human communication and rigid operational constraints. A travel coordinator in Nairobi regularly receives messages like: 'Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount.' Notice that a single sentence switches seamlessly between Swahili ('Tunataka', 'kwa', 'kuanzia') and English ('quote', 'people', 'discount'), omits residency status, implies a multi-vehicle convoy because 10 guests cannot fit in one 7-seat Land Cruiser, and requests a 15% discount that exceeds standard sales authority.",
          "To quote that single inquiry accurately without human error, a system must simultaneously resolve four separate challenges. First, park conservation tariffs vary sharply by authority (Narok County Reserve vs. Kenya Wildlife Service parks vs. private conservancies), season (High vs. Low months), age bracket (Adult, Child, and free Infants under 5), and residency tier (East African Citizen in KES, Kenya Resident in KES, African Citizen in USD, and Non-Resident in USD). Second, vehicles must be licensed (TSV-certified), mechanically available (not in maintenance), and free across every overlapping day of the trip. Third, every dispatched vehicle requires an available licensed guide—meaning a 10-guest booking needs two vehicles and therefore two guides. Fourth, if two coordinators click 'Confirm' in the same second for the same vehicle, the database must allow only one winner.",
        ],
      },
      {
        heading: "Why Pure LLMs Fail—And Why Pure Rules Fail Too",
        body: [
          "If you paste a tariff sheet into a standard Large Language Model (LLM) prompt and ask it to 'reply with a quote and book a vehicle', two predictable failures happen. First, LLMs predict probable next words rather than executing exact arithmetic: a 4-billion-parameter model can easily confuse KES 3,000/day with USD 300, forget to multiply by days instead of nights, or hallucinate that Serengeti (in Tanzania) is a Kenyan circuit you operate. Second, an LLM has no transactional lock over shared inventory. Even if an LLM reads a fleet list at 10:00:01 AM, it cannot atomically reserve Cruiser LC-01 before another session grabs it at 10:00:02 AM.",
          "Conversely, classic deterministic software without AI cannot understand free-form code-switched WhatsApp messages. A strict regex parser breaks the moment a guest writes 'five grownups plus two little ones next Friday' or uses regional phrasing. Forcing tour agents or travelers to click through 14 dropdowns slows sales response times and loses bookings.",
        ],
      },
      {
        heading: "The Neuro-Symbolic Solution Architecture",
        body: [
          "Safari Dispatch OS resolves this tension using a Neuro-Symbolic architecture—combining neural networks (pattern recognition on messy human language) with symbolic logic (deterministic code, relational SQL queries, and rule engines).",
          "In this architecture, the neural component (Local Ollama running Qwen3-4B) is strictly fenced to two boundaries: the front door (Natural Language Understanding, or NLU, turning unstructured text into typed JSON slots) and the back door (Grounded Natural Language Generation, or NLG, turning verified database numbers into a polite English/Swahili reply). Everything in the middle—date validation, park fee lookup, greedy vehicle seating, guide matching, policy critique, approval queuing, and atomic booking persistence—is 100% deterministic TypeScript and Python executing against PostgreSQL or SQLite.",
        ],
      },
    ],
    keyTakeaways: [
      "Never let an LLM perform financial arithmetic, invent inventory, or mutate database state directly.",
      "Use neural models where language is fuzzy (intake NLU and customer-facing NLG), and deterministic code where truth is exact (pricing, scheduling, and policy enforcement).",
      "Every decision node emits a structured record into audit_log so executives and engineers can inspect exactly why a quote was confirmed, held, or rejected.",
    ],
  },
  {
    id: "api-and-idempotency",
    number: "02",
    title: "The Front Door: HTTP API, Thread Identity & Idempotency",
    subtitle: "How requests enter the backend safely without duplicate charges or lost conversation history.",
    readingMinutes: 4,
    aiConcepts: ["Stateful Agent Threads", "Multi-Turn Context Anchoring"],
    backendComponents: ["Express / FastAPI Routes", "idempotency_records", "thread_id"],
    executiveSummary:
      "When cellular internet drops in Nairobi or a coordinator clicks 'Send' twice, naive web apps create duplicate safari bookings that double-charge customers and block vehicles. Idempotency keys and thread IDs guarantee that retries return the exact original result without double-booking.",
    businessImpactMetric: "Zero duplicate bookings from network retries or double-clicks",
    beginnerAnalogy:
      "Imagine writing a unique tracking number on an envelope before mailing a check. If the courier accidentally delivers a photocopy of the exact same envelope five minutes later, the bank recognizes the tracking number and simply hands back a copy of the first receipt instead of cashing the check twice.",
    sections: [
      {
        heading: "Request Entry & Input Validation",
        body: [
          "Every quote begins as an HTTP POST request to /api/inquiries carrying a JSON payload: message (required non-empty string), optional thread_id, optional customer_name, and optional mode ('ollama', 'deterministic', or 'gemini' when explicitly enabled). Both the primary Node/Express server (server.ts) and the Python/FastAPI reference (python_reference/src/api.py) expose identical route contracts so frontend clients and automated tests work seamlessly across stacks.",
          "Before any AI model is woken up—saving both GPU time and latency—the endpoint runs two cheap synchronous checks: validating that message is non-empty (returning HTTP 400 otherwise) and checking the Idempotency-Key HTTP header.",
        ],
      },
      {
        heading: "Idempotency Keys: Stopping Double-Bookings Before They Start",
        body: [
          "In real-world safari desks, mobile connections flake and browsers retry POST requests. If a coordinator sends 'Book Lake Nakuru for 2 adults starting 2026-12-20' with header Idempotency-Key: idem-auto-001, the server checks the idempotency_records SQL table before running the workflow.",
          "If that key already exists in idempotency_records, the backend short-circuits the entire AI pipeline, parses the cached response_json, flips idempotent_replay to true, and returns the identical JSON immediately. No second LLM call occurs, no second row is inserted into bookings, and no second vehicle is locked. When a new key succeeds, the final response is stored inside idempotency_records using ON CONFLICT (idempotency_key) DO NOTHING.",
        ],
        codeExample: {
          title: "Idempotency Short-Circuit Guard",
          fileRef: "server.ts (lines 103–120)",
          snippet: `const idempotencyKey = req.header("Idempotency-Key")?.trim() || null;
if (idempotencyKey) {
  const cached = await readConn(
    (conn) => conn.get<{ response_json: string }>(
      "SELECT response_json FROM idempotency_records WHERE idempotency_key = ?",
      idempotencyKey
    ),
    DEFAULT_DB_PATH
  );
  if (cached) {
    const parsed = JSON.parse(cached.response_json);
    parsed.idempotent_replay = true;
    res.json(parsed);
    return;
  }
}`,
        },
      },
      {
        heading: "Thread IDs & Multi-Turn Memory Hydration",
        body: [
          "Alongside idempotency, every conversation receives a thread_id (for example, thr-a1b2c3d4e5). If the caller omits thread_id, the backend generates a fresh random 10-hex-character identifier. If the caller passes an existing thread_id—such as when answering a follow-up question like '4 adults starting 2026-12-20' after initially asking 'Quote for Amboseli please'—the orchestrator queries workflow_checkpoints (or LangGraph's SqliteSaver) to load prior_slots from the previous turn.",
          "Notice why separating idempotency_key (per HTTP attempt) from thread_id (per multi-turn deal) is essential: one multi-turn booking thread can contain several unique messages, each with its own retry-safe idempotency key.",
        ],
      },
    ],
    keyTakeaways: [
      "Idempotency checks run before LLM inference, eliminating duplicate compute and duplicate bookings simultaneously.",
      "thread_id links multi-turn follow-up messages to saved partial state without asking the user to repeat themselves.",
      "Both Node/Express and Python/FastAPI mirror the exact same API contract and status codes.",
    ],
  },
  {
    id: "transformer-llm-and-ollama",
    number: "03",
    title: "Crash Course: Transformer LLMs, Quantization & Local Ollama",
    subtitle: "How Qwen3-4B works under the hood on local hardware—without sending client data to the cloud.",
    readingMinutes: 6,
    aiConcepts: ["Tokenization", "Self-Attention Transformers", "4-bit Q4_K_M Quantization", "GGUF & Ollama", "Temperature & Reasoning Toggle"],
    backendComponents: ["OLLAMA_BASE_URL", "OLLAMA_MODEL (qwen3:4b)", "think: false"],
    executiveSummary:
      "Running Qwen3-4B locally via Ollama eliminates per-token cloud bills, keeps private customer itineraries inside your own network, and removes internet outages as a single point of failure.",
    businessImpactMetric: "$0/month per-token LLM API fees · 100% on-premise data privacy",
    beginnerAnalogy:
      "Think of a 4-billion-parameter model as a compact, well-read specialist assistant who memorized libraries of English and Swahili phrasing. Quantization is like printing their reference handbook in crisp shorthand so it fits in 3 GB of desk RAM instead of requiring a warehouse server.",
    sections: [
      {
        heading: "What Is a Transformer LLM (and What Does '4B' Mean)?",
        body: [
          "Qwen3-4B is a decoder-only Transformer neural network with roughly 4 billion adjustable numerical weights (parameters). Before the model can read a customer's email, text is sliced into sub-word chunks called tokens by a Byte-Pair Encoding (BPE) tokenizer. Common English words like 'safari' or 'adults' become single tokens, while Swahili words like 'kuanzia' may split into one or two frequent morpheme tokens.",
          "Those token IDs enter dozens of stacked Transformer layers. Inside each layer, Multi-Head Self-Attention computes relationship scores between every token and every earlier token in the prompt. Attention is why the model knows that '10' modifies 'people', '15%' modifies 'discount', and 'Mara' refers to 'Maasai Mara Classic' listed in the system prompt—even when words appear out of order or cross languages.",
        ],
      },
      {
        heading: "Why 4-Bit Quantization (Q4_K_M GGUF) Makes Laptop AI Practical",
        body: [
          "During training, neural network weights are typically stored as 16-bit floating-point numbers (FP16, 2 bytes per parameter). Four billion weights at 2 bytes each require ~8 GB of memory just to hold the weights, before adding the attention Key-Value (KV) cache.",
          "Ollama runs models packaged in GGUF format using 4-bit quantization (specifically Q4_K_M). Quantization compresses groups of 16-bit weights down to ~4.5 bits on average by storing a shared high-precision block scale factor plus compact integer offsets. That shrinks Qwen3-4B from ~8 GB to roughly 2.6–3.0 GB on disk and in RAM/VRAM—small enough to run smoothly on an office laptop CPU or modest GPU via llama.cpp inside Ollama, while keeping structured extraction accuracy nearly identical to FP16.",
        ],
        formulaBox: {
          label: "Memory Footprint Rule of Thumb",
          expression: "VRAM_weights ≈ Parameters × (Bits_per_weight / 8)",
          explanation:
            "For Qwen3-4B (4×10⁹ params): at 16-bit = ~8.0 GB; at 4-bit Q4_K_M (~4.8 bits effective with block scales) = ~2.5 GB + ~0.5 GB KV cache ≈ 3 GB total.",
        },
      },
      {
        heading: "Temperature = 0 and think: false for Production Speed",
        body: [
          "At the end of every forward pass, the Transformer outputs raw scores (logits) across its entire vocabulary (~151,000 possible next tokens). Temperature scales those logits before converting them into probabilities via Softmax. A high temperature (such as 0.8) flattens probabilities so creative stories vary each run. During NLU slot extraction, we do NOT want creativity—we want repeatable precision. Setting temperature: 0 tells Ollama to pick the single highest-probability valid token every time (greedy decoding).",
          "Qwen3 models also support an internal 'thinking' scratchpad (<think>...</think>) designed for multi-step math riddles. Because Safari Dispatch OS never lets the LLM do math—and thinking tokens add 3 to 10 seconds of extra latency—server/nlu.ts and python_reference/src/nodes.py explicitly pass think: false (reasoning=False in LangChain). That cuts local NLU latency down to roughly 0.3–1.5 seconds per message.",
        ],
      },
    ],
    keyTakeaways: [
      "Ollama exposes a simple local HTTP API (POST http://localhost:11434/api/chat) so both Node and Python talk to the same model server.",
      "Q4_K_M quantization makes a 4B bilingual model fit in ~3 GB of memory without cloud GPUs.",
      "Passing temperature: 0 and think: false turns Qwen3-4B from a slow chatty assistant into a fast, repeatable data extractor.",
    ],
  },
  {
    id: "nlu-and-constrained-decoding",
    number: "04",
    title: "Node 1 — Intake NLU: Constrained JSON Schema & Heuristic Fallback",
    subtitle: "Converting unstructured Swahili/English prose into strict InquirySlots without JSON parse errors.",
    readingMinutes: 5,
    aiConcepts: ["Named Entity Recognition & Slot Filling", "Grammar-Constrained Decoding (CFG)", "Graceful Degradation"],
    backendComponents: ["server/nlu.ts", "SLOT_JSON_SCHEMA", "heuristicExtract", "mergeSlots"],
    executiveSummary:
      "Even if a customer writes in casual Sheng or mixed Swahili/English, the system extracts exact trip dates, guest ages, residency status, and discounts into a clean form—and seamlessly falls back to local pattern rules if the AI server is offline.",
    businessImpactMetric: "Zero JSON syntax crashes · Automatic uptime fallback when Ollama is offline",
    visualId: "nlu_decoding",
    beginnerAnalogy:
      "Imagine handing someone a multiple-choice Scantron form instead of a blank sheet of paper. Constrained JSON decoding physically blocks the AI from scribbling outside the boxes—it can only pick valid keys, numbers, booleans, or allowed residency strings.",
    sections: [
      {
        heading: "Slot Filling vs. Open-Ended Chat",
        body: [
          "In Natural Language Understanding (NLU), our goal is not to chat back immediately—it is to populate a fixed contract called InquirySlots. Specifically, the backend expects 12 fields: intent, language ('en' | 'sw' | 'mixed'), customer_name, circuit_name, start_date (ISO YYYY-MM-DD), adults, children, infants_under_5, residency_tier ('ea_citizen' | 'ke_resident' | 'af_citizen' | 'non_resident' | null), prefer_senior_guide (boolean), discount_pct (0–50), and missing_fields.",
          "Notice two subtle domain rules embedded directly into NLU_SYSTEM_PROMPT: first, if the customer mentions an unrecognized park like 'Serengeti' or 'Ngorongoro', the LLM must preserve that exact park name in circuit_name rather than guessing 'Maasai Mara Classic'. Letting the backend's pricing database reject unknown parks prevents silent false bookings. Second, if only total people are stated ('10 people' or 'watu 10'), adults is set to 10 and children to 0.",
        ],
      },
      {
        heading: "How Constrained JSON Schema Decoding Works",
        body: [
          "Older LLM integrations prompted the model with 'Please output JSON only' and prayed it wouldn't wrap the answer in markdown backticks or drop a comma. Ollama solves this mathematically via the format: SLOT_JSON_SCHEMA parameter (and LangChain's .with_structured_output(InquirySlots, method='json_schema') in Python).",
          "Under the hood, Ollama compiles JSON Schema into a context-free grammar state machine. Before sampling each next token, any token in the vocabulary that would violate the JSON grammar (for instance, typing text instead of a digit after \"adults\":, or writing an invalid enum like \"tourist\" instead of \"non_resident\") has its logit masked to negative infinity (-∞), giving it a 0% probability. This guarantees syntactically valid JSON conforming to our schema on 100% of responses.",
        ],
        codeExample: {
          title: "Schema-Enforced Local Ollama Extraction",
          fileRef: "server/nlu.ts (lines 225–243)",
          snippet: `const res = await fetch(\`\${baseUrl}/api/chat\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  signal: controller.signal,
  body: JSON.stringify({
    model,
    stream: false,
    think: false,
    format: SLOT_JSON_SCHEMA,
    options: { temperature: 0 },
    messages: [
      { role: "system", content: NLU_SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
  }),
});`,
        },
      },
      {
        heading: "Deterministic Normalization, Fallback & Multi-Turn Merging",
        body: [
          "Even with schema decoding, defense-in-depth matters. normalizeParsedSlots clamps discount_pct into [0, 50], truncates guest counts to non-negative integers, and trims strings. If Ollama is offline, times out after OLLAMA_TIMEOUT_SEC (30s), or returns an HTTP error, extractInquirySlots automatically catches the exception, logs fallbackError, and invokes heuristicExtract—a fast English/Swahili lexicon and regular-expression extractor—tagging extractionSource as 'heuristic_fallback'.",
          "Next, mergeSlots combines prior_slots (from an earlier turn on the same thread_id) with newly extracted slots. Any explicitly mentioned field overrides prior values, while missing fields from the follow-up turn preserve earlier choices (for example, keeping 'Amboseli Kilimanjaro Loop' from turn 1 when turn 2 only says '4 adults starting 2026-12-20'). Finally, intakeNode checks whether circuit_name, adults (> 0), or a valid ISO start_date are missing; if so, it marks intent = 'clarification_needed' so the workflow asks the user instead of guessing.",
        ],
      },
    ],
    keyTakeaways: [
      "Grammar-based JSON Schema decoding makes malformed AI output impossible at the token-sampling level.",
      "Explicit system rules stop the AI from substituting unknown parks like Serengeti with known Kenyan parks.",
      "If Ollama is unreachable, the system degrades transparently to heuristic_fallback and records the exact reason in the AI Pipeline Trace.",
    ],
  },
  {
    id: "pricing-and-bin-packing",
    number: "05",
    title: "Node 2 — Deterministic Specialist: Tariffs, Dual Currency & Fleet Allocation",
    subtitle: "Why exact pricing math, seasonal tables, and greedy vehicle seating live strictly in SQL and TypeScript/Python.",
    readingMinutes: 5,
    aiConcepts: ["Tool Grounding", "Greedy Bin-Packing Heuristic", "Interval Overlap Predicates"],
    backendComponents: ["server/pricing.ts", "circuits / fleet / guides tables", "buildSafariQuote"],
    executiveSummary:
      "Every shilling and dollar on a customer quote comes directly from audited database tariff tables, verified seasonal rules, and real-time fleet/guide availability—guaranteeing zero margin leaks from AI rounding mistakes.",
    businessImpactMetric: "100% deterministic KES/USD pricing · Exact seat & guide matching",
    beginnerAnalogy:
      "Think of loading tour vans like packing suitcases into car trunks: you load the largest licensed vehicles first so the fewest total vehicles and guides are needed, while never putting a guest in a vehicle that is in the workshop or already out on safari.",
    sections: [
      {
        heading: "Circuit Resolution Without Hallucination",
        body: [
          "Once intakeNode confirms all required slots are present, execution routes to specialistNode, which calls buildSafariQuote. First, it queries the circuits table using case-insensitive exact match on name/code followed by substring LIKE matching. Crucially, if no circuit matches (such as 'Serengeti'), buildSafariQuote returns an explicit error listing only the 6 valid circuits stored in the database. Because the Critic node checks 'error' in quote, unknown parks are immediately rejected cleanly rather than misquoted.",
        ],
      },
      {
        heading: "Seasonality, Residency Tiers & Dual-Currency Pricing Math",
        body: [
          "Kenyan park fees follow dual calendars and residency pricing established by Narok County and Kenya Wildlife Service (KWS). Helper isHighSeason encodes both rules deterministically: for narok_reserve (Maasai Mara), July through December is High Season; for kws_park and conservancy circuits (Amboseli, Tsavo, Lake Nakuru, Samburu), peak wildlife and holiday windows (Jan–Feb, Jul–Oct, Dec) are High Season.",
          "Notice the currency split: East African Citizens (ea_citizen) and Kenya Residents (ke_resident) have statutory park fees denominated in Kenyan Shillings (KES) and converted to USD via USD_TO_KES_RATE, whereas African Citizens (af_citizen) and Non-Residents (non_resident) pay park fees in USD converted to KES. Meanwhile, accommodation uses lodge_nightly_usd across nights = days - 1, where children pay 50% of the adult lodge rate and infants_under_5 stay and enter parks free.",
        ],
        formulaBox: {
          label: "Total Quote Equation",
          expression:
            "Net_USD = round2((Vehicles_USD + Guides_USD + Lodge_USD + ParkFees_USD) × (1 - Discount_% / 100))",
          explanation:
            "Where Vehicles_USD = Σ(daily_rate_usd × days), Guides_USD = Σ(guide_rate × days), Lodge_USD = lodge_nightly_usd × (days - 1) × (adults + 0.5 × children), and ParkFees cover all circuit days.",
        },
      },
      {
        heading: "Interval Overlap Filtering & Greedy Fleet Bin-Packing",
        body: [
          "Before assigning vehicles or guides, SQL filters out every asset that is unavailable or already committed on any overlapping day between start_date and end_date (computed as start_date + days - 1). Date overlap uses the classic closed-interval negation predicate: NOT (va.end_date < start_date OR va.start_date > end_date). In addition, vehicles must have status = 'available' AND tsv_licensed = 1 (so maintenance Cruiser LC-04 is excluded).",
          "Next, allocateVehicles runs a greedy bin-packing pass: available vehicles are sorted by descending max_pax (largest capacity first, breaking ties by lowest daily_rate_usd). For a 10-guest group when 8-seat Safari Tour Van OV-01 and 7-seat Extended Cruiser LX-01 are free, the allocator assigns OV-01 (8 guests) plus LX-01 (2 guests) for 0 uncovered passengers. If 30 guests request a date where total fleet capacity is 28 seats, uncoveredPax becomes 2. One guide is required per assigned vehicle (guides_required = max(assignedVehicles.length, 1)), matching senior guides first unless prefer_senior_guide restricts the pool.",
        ],
      },
    ],
    keyTakeaways: [
      "Zero pricing figures are ever stored inside LLM prompts—every tariff lives in the circuits SQL table.",
      "Date-range overlap SQL excludes any vehicle or guide booked on even a single overlapping day.",
      "Multi-vehicle bookings automatically allocate one guide per vehicle, ensuring operational safety.",
    ],
  },
  {
    id: "critic-and-reflection-loop",
    number: "06",
    title: "Node 3 — Policy Critic & Self-Correction Reflection Loop",
    subtitle: "Distinguishing impossible hard blockers from negotiable soft policy exceptions.",
    readingMinutes: 4,
    aiConcepts: ["Critic-Reflector Pattern", "Hard vs. Soft Constraints", "Bounded Agent Loops (MAX_RETRIES)"],
    backendComponents: ["criticNode", "MAX_AUTO_DISCOUNT_PCT", "MAX_DAILY_DRIVE_HOURS_SAFE"],
    executiveSummary:
      "Not every problem should stop a deal dead, and not every deal should auto-confirm. The Policy Critic separates physically impossible requests (too many guests for your fleet) from high-risk commercial choices (15% discounts or convoys) that only need a human manager's sign-off.",
    businessImpactMetric: "Automatic escalation of discounts > 10% · Instant rejection of impossible over-capacity",
    beginnerAnalogy:
      "Think of an airline safety and finance officer checking a flight plan: 'You only have 100 seats for 150 passengers' is a hard blocker—the plane cannot take off. 'You requested a 15% VIP fare discount or two planes in formation' is a soft policy check—a manager just needs to co-sign.",
    sections: [
      {
        heading: "Hard Operational Failures vs. Soft Business Guardrails",
        body: [
          "After specialistNode builds the quote, criticNode inspects the quote object without touching the database for writes. It classifies issues into two strictly separate arrays inside CritiqueResult:",
          "1. hard_failures (Immediate Rejection): Invalid dates, unknown park circuits, uncovered_pax > 0 (insufficient seats across the entire available fleet), or guides_shortfall > 0 (not enough free guides to staff every vehicle). A request with any hard failure NEVER enters the manager approval queue—it is rejected immediately so managers aren't spammed with physically impossible bookings.",
          "2. soft_reasons (Human-in-the-Loop Escalation): Multi-vehicle convoys (assigned_vehicles.length > 1), grueling itineraries where max_daily_drive_hours exceeds MAX_DAILY_DRIVE_HOURS_SAFE (7.5h, such as the 8.5h Grand Rift & Mara Marathon), or commercial discounts exceeding MAX_AUTO_DISCOUNT_PCT (10%). When hard_failures is empty and soft_reasons is non-empty, requires_human_approval flips to true.",
        ],
      },
      {
        heading: "Bounded Self-Correction: Relaxing Senior Guide Preference",
        body: [
          "What if a customer asks for a 'senior guide' (prefer_senior_guide = true) on a peak weekend when all 3 senior guides are booked, yet standard guides like Grace Wanjiku are still free? Rather than immediately rejecting a viable $4,000 safari, the workflow executes a bounded reflection loop (up to MAX_RETRIES = 2).",
          "When criticNode reports a guide shortfall while prefer_senior_guide is true, control loops back to specialistNode, increments retry_count, relaxes prefer_senior_guide to false, and re-runs buildSafariQuote. Why cap loops at MAX_RETRIES = 2? Because unbounded agent loops can spin indefinitely on contradictory constraints; capping retries guarantees bounded latency and predictable execution.",
        ],
      },
    ],
    keyTakeaways: [
      "Hard failures reject cleanly before wasting a human supervisor's attention.",
      "Soft policy thresholds (10% discount, 7.5h drive hours, >1 vehicle) live in environment/policy config and trigger HITL review.",
      "Bounded self-correction solves recoverable guide shortages automatically without risking infinite loops.",
    ],
  },
  {
    id: "hitl-and-ghost-holds",
    number: "07",
    title: "Node 4 — Human-in-the-Loop Checkpointing & Preventing Ghost Holds",
    subtitle: "How the workflow pauses mid-flight for manager sign-off without freezing fleet inventory.",
    readingMinutes: 5,
    aiConcepts: ["Human-in-the-Loop (HITL) Interrupts", "Durable Execution Checkpointing", "Optimistic vs. Pessimistic Locking"],
    backendComponents: ["workflow_checkpoints", "pending_approvals", "resumeApprovalWorkflow"],
    executiveSummary:
      "If waiting 4 hours for a manager to approve a 15% discount locked two Land Cruisers in the meantime, legitimate paying customers could be turned away—creating 'ghost holds'. Safari Dispatch OS freezes the conversation state in a checkpoint without locking vehicles until approval.",
    businessImpactMetric: "Zero ghost-held vehicles during pending approvals · Full audit trail of who approved what",
    visualId: "concurrency_toctou",
    beginnerAnalogy:
      "Think of putting an online shopping cart item in 'Save for Later' instead of locking the warehouse shelf. Another shopper can still buy the last item right now; when you come back and click 'Pay', the checkout counter checks the shelf one last time at the exact moment of purchase.",
    sections: [
      {
        heading: "How Interrupt & Durable State Checkpointing Work",
        body: [
          "When criticNode sets requires_human_approval = true, the workflow halts before touching bookings, vehicle_allocations, or booking_guides. In the Python reference, LangGraph invokes interrupt({...}) and serializes the entire DispatchState into checkpoints.db via SqliteSaver. In the TypeScript backend, runInquiryWorkflow persists the serialized DispatchState, paused = 1, and interrupt_json into workflow_checkpoints, then inserts a row into pending_approvals with status = 'pending'.",
          "Because the entire execution state is saved on disk, the server can even restart overnight while a manager thinks about a discount. When the manager opens Quotes & Approvals and clicks Approve or Hold / Decline, POST /api/approvals/:threadId/resolve loads the checkpoint via thread_id and resumes directly at human_approval -> finalizerNode.",
        ],
      },
      {
        heading: "Why Deferred Locking Eliminates Ghost Inventory",
        body: [
          "Suppose Coordinator A submits a 10-person Maasai Mara quote requesting a 15% discount, which pauses for manager approval. Five minutes later, Coordinator B submits a full-price, zero-exception booking for Amboseli on the same dates using one of the free Cruisers. Because Coordinator A's pending quote did NOT write rows into vehicle_allocations, Coordinator B succeeds immediately.",
          "If Coordinator A's manager later clicks 'Decline', finalizerNode records status = 'held' in bookings with zero active vehicle_allocations or booking_guides. And if the manager clicks 'Approve' after Coordinator B already took that vehicle, the database's atomic conflict guard detects the overlap and cleanly returns HTTP 409 Conflict instead of creating a double-booking!",
        ],
      },
    ],
    keyTakeaways: [
      "Vehicles and guides are NEVER locked while waiting for manager approval.",
      "Durable checkpoints allow approvals to survive server restarts without losing quote context.",
      "Declined approvals record a 'held' audit trail in bookings while keeping 100% of fleet inventory free.",
    ],
  },
  {
    id: "concurrency-and-toctou",
    number: "08",
    title: "Database Layer — Atomic Transactions & TOCTOU Double-Booking Defense",
    subtitle: "Closing the millisecond race-condition gap with SQLite BEGIN IMMEDIATE and PostgreSQL btree_gist locks.",
    readingMinutes: 5,
    aiConcepts: ["TOCTOU Race Conditions", "ACID Serializability", "Exclusion Constraints (GiST)"],
    backendComponents: ["server/db.ts", "persistBookingTransaction", "data/postgres_schema.sql"],
    executiveSummary:
      "Even with fast checks, two coordinators clicking 'Confirm' in the exact same millisecond can both pass an initial availability check. Database-level locks make double-booking mathematically impossible across both local SQLite and production PostgreSQL.",
    businessImpactMetric: "Mathematically impossible vehicle/guide double-bookings under concurrent load",
    beginnerAnalogy:
      "Imagine two runners checking whether a single baton is on a table at the exact same millisecond—both see 'yes' and both reach out (a Time-of-Check to Time-of-Use bug). An atomic lock puts a turnstile around the table so only one runner can enter, verify, and pick up the baton at a time.",
    sections: [
      {
        heading: "Anatomy of a TOCTOU Bug in Booking Systems",
        body: [
          "Time-of-Check to Time-of-Use (TOCTOU) bugs happen whenever a system checks availability in Step A ('Is Cruiser LC-01 free?') and inserts the reservation in Step B ('Allocate LC-01'), leaving an unguarded gap between them. Earlier in Node 2, buildSafariQuote ran a read-only SELECT to build a price quote. Between that read and final persistence—especially across an async LLM reply or a 10-minute HITL pause—another request could book LC-01.",
        ],
      },
      {
        heading: "Two-Layer Lock Strategy: SQLite WAL vs. PostgreSQL SERIALIZABLE + btree_gist",
        body: [
          "Safari Dispatch OS neutralizes TOCTOU inside persistBookingTransaction using database-native serialization tailored to whichever engine is active:",
          "• Local SQLite (BEGIN IMMEDIATE + WAL): writeTx wraps the conflict re-check and all three INSERT statements (bookings, vehicle_allocations, booking_guides) inside BEGIN IMMEDIATE ... COMMIT. In SQLite WAL mode, BEGIN IMMEDIATE acquires an exclusive database write lock up front. Any concurrent booking waits (up to busy_timeout = 30000ms), then re-runs the SELECT check against committed allocations, detects the overlap, rolls back cleanly, and throws BookingConflictError.",
          "• Docker / Production PostgreSQL 16 (SERIALIZABLE + btree_gist): Not only does writeTx open BEGIN ISOLATION LEVEL SERIALIZABLE, but data/postgres_schema.sql defines hardware-enforced storage exclusion constraints on both vehicle_allocations and booking_guides using PostgreSQL's btree_gist extension: EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (status = 'active'). Even if application code had a bug, PostgreSQL itself refuses any overlapping active date range with SQLSTATE 23P01 or 40001, which server/db.ts maps directly to BookingConflictError (HTTP 409).",
        ],
        codeExample: {
          title: "Storage-Level Anti-Double-Booking Constraint",
          fileRef: "data/postgres_schema.sql (lines 74–86)",
          snippet: `CREATE TABLE IF NOT EXISTS vehicle_allocations (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    vehicle_id INTEGER NOT NULL REFERENCES fleet(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    assigned_pax INTEGER NOT NULL CHECK (assigned_pax > 0),
    status TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT excl_vehicle_active_dates EXCLUDE USING gist (
        vehicle_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (status = 'active')
);`,
        },
      },
    ],
    keyTakeaways: [
      "Read checks during quoting are informational; only the write transaction enforces booking locks.",
      "SQLite BEGIN IMMEDIATE serializes writes locally; PostgreSQL SERIALIZABLE + btree_gist enforces range exclusion natively at the storage engine.",
      "Auto-fallback in server/db.ts lets developers run Postgres via Docker locally while defaulting cleanly to SQLite with zero config.",
    ],
  },
  {
    id: "grounded-nlg-and-guardrails",
    number: "09",
    title: "Node 5 — Grounded NLG Synthesis & Programmatic Output Guardrails",
    subtitle: "Letting the LLM write warm bilingual customer replies while mathematically blocking invented numbers.",
    readingMinutes: 5,
    aiConcepts: ["Grounded Natural Language Generation (NLG)", "Anchor Verification Guardrails", "Fail-Safe Deterministic Fallback"],
    backendComponents: ["synthesizeGroundedReply", "verifyGroundedReply", "NLG_SYSTEM_PROMPT"],
    executiveSummary:
      "Customers receive polite, natural replies in the exact language they wrote in (English, Swahili, or mixed), while an automated verification gate double-checks every draft to ensure no price, date, or booking ID was altered by the AI.",
    businessImpactMetric: "Warm bilingual replies · 0% chance of misstated prices reaching customers",
    beginnerAnalogy:
      "Imagine a press secretary drafting a friendly announcement from an official fact sheet, followed by a proofreader with a red pen who rejects the draft and swaps in the pre-approved template if even a single dollar figure or booking number is missing.",
    sections: [
      {
        heading: "Why Grounded NLG Matters After Deterministic Finalization",
        body: [
          "Once finalizerNode commits the booking inside the atomic transaction (or records a held/rejected status), it already owns the 100% verified GroundingContext: booking_id, circuit_name, start_date, end_date, days, total_pax, vehicle_codes, guide_names, quoted_total_usd, quoted_total_kes, and reasons, plus a pre-built deterministic fallback_template.",
          "Rather than sending robotic canned English to a Swahili-speaking traveler, synthesizeGroundedReply passes ONLY that verified GROUNDING_FACTS JSON and the original message to Local Ollama (NLG_SYSTEM_PROMPT) at low temperature (temperature: 0.2, think: false). Setting T = 0.2 allows slightly smoother phrasing than extraction's T = 0 while keeping the output tightly anchored to the facts.",
        ],
      },
      {
        heading: "Inside verifyGroundedReply: The Final Safety Net",
        body: [
          "Before any LLM-written reply reaches the browser or API caller, verifyGroundedReply runs deterministic anchor checks on the draft:",
          "1. Length & Sanity Check: Rejects empty or truncated replies (< 12 characters).",
          "2. Confirmed Booking Anchors: If status === 'confirmed', the text MUST contain the exact numeric booking_id (e.g., 14) AND the exact quoted_total_usd formatted in USD (checking fixed 2-decimal, comma-formatted, or integer-exact strings). If the LLM rounded $1,150.25 to '$1,150' or omitted the booking ID, verification fails.",
          "3. Policy Transparency Anchor: If a quote was rejected due to an unknown park, the text MUST explicitly include the phrase 'unknown circuit' so the user understands why.",
          "Whenever verifyGroundedReply returns ok: false—or if Ollama is offline—the backend logs the reason into the AI Pipeline Trace (responseSource: 'template_grounding_guardrail' or 'template_fallback') and immediately returns the safe, verified deterministic fallback_template.",
        ],
        codeExample: {
          title: "Numeric & Booking ID Output Verification",
          fileRef: "server/nlu.ts (lines 409–442)",
          snippet: `if (facts.status === "confirmed") {
  if (facts.booking_id && !cleaned.includes(String(facts.booking_id))) {
    return { ok: false, reason: \`Missing exact Booking #\${facts.booking_id} anchor.\` };
  }
  if (typeof facts.quoted_total_usd === "number") {
    const formatted = facts.quoted_total_usd.toFixed(2);
    // Reject draft if exact verified USD total is absent or altered
    if (!cleaned.includes(formatted) && !cleaned.includes(commaFormatted) && ...) {
      return { ok: false, reason: \`Missing verified USD total ($\${formatted}).\` };
    }
  }
}`,
        },
      },
    ],
    keyTakeaways: [
      "Grounded NLG receives facts ONLY after database persistence succeeds—never before.",
      "Temperature 0.2 balances natural bilingual phrasing with low variance.",
      "Every generated reply passes programmatic anchor checks, falling back cleanly to verified templates on any mismatch.",
    ],
  },
  {
    id: "qlora-specialization-and-observability",
    number: "10",
    title: "Observability, Audit Trails & Optional QLoRA Fine-Tuning",
    subtitle: "How every step is audited for compliance—and how historical transcripts can later specialize Qwen3-4B.",
    readingMinutes: 5,
    aiConcepts: ["AI Trace Observability", "LoRA / QLoRA Low-Rank Adaptation", "Catastrophic Forgetting Prevention"],
    backendComponents: ["audit_log", "workflow_checkpoints", "Model Training Playbook"],
    executiveSummary:
      "Every AI guess, database query, policy check, and manager decision is recorded in a tamper-evident audit trail. Later, when you have a GPU, those exact transcripts can fine-tune a custom Nairobi-slang adapter without touching your core pricing logic.",
    businessImpactMetric: "Full decision traceability · Optional low-cost domain specialization from real logs",
    visualId: "qlora_adapters",
    beginnerAnalogy:
      "Think of LoRA fine-tuning like giving an experienced doctor a thin pocket field-manual for Nairobi slang instead of sending them back through 4 years of medical school. Their core knowledge stays frozen; only a tiny 1–2% notebook of local idioms is trained.",
    sections: [
      {
        heading: "End-to-End Observability via audit_log and AI Pipeline Trace",
        body: [
          "In enterprise AI, silent black boxes destroy trust. Throughout every inquiry, each node (intake, clarification, specialist, critic, human_approval, finalizer) writes an immutable row into audit_log containing thread_id, node_name, decision, and JSON details. Simultaneously, the TypeScript orchestrator constructs an AiTrace object measuring exact millisecond latencies, engines used (e.g., ollama:qwen3:4b vs. heuristic_fallback), prompts, inputs, and outputs across all 5 pipeline stages, rendered live inside Quotes & Approvals.",
        ],
      },
      {
        heading: "Crash Course: How LoRA and QLoRA Adapt Qwen3-4B",
        body: [
          "Out of the box, Qwen3-4B understands standard English and Swahili well, guided by few-shot examples in NLU_SYSTEM_PROMPT. However, if a desk encounters dense Nairobi Sheng ('wasee', 'mabuda', 'mresh', 'mtu mzima') or regional shorthand ('4wd kaa 3 days Mara bila guide kubwa'), an optional later step is Supervised Fine-Tuning (SFT) with QLoRA—documented in full with runnable scripts on the Model Training page.",
          "In standard full fine-tuning, updating all 4 billion weights of Qwen3-4B requires ~60+ GB of GPU VRAM to store weights, gradients, and Adam optimizer states. LoRA (Low-Rank Adaptation) solves this using linear algebra: instead of modifying a massive frozen weight matrix W₀ (size d × k), LoRA attaches two skinny trainable matrices A (d × r) and B (r × k) with rank r = 16 alongside it. During training, W₀ stays frozen in 4-bit NormalFloat (NF4) quantization—that's the 'Q' in QLoRA—while only the tiny A and B matrices (~1–2% of parameters) update via backpropagation, fitting comfortably on a single 12–16 GB VRAM GPU.",
          "After training, the adapter ΔW = (α / r) · B · A is merged back into the 16-bit base model, converted into a 4-bit Q4_K_M GGUF file via llama.cpp, and imported into Ollama with a single Modelfile command—slot-in ready with zero changes to backend code.",
        ],
        formulaBox: {
          label: "LoRA Forward Pass",
          expression: "h = W₀·x + (α / r) · (B · A) · x",
          explanation:
            "W₀ is frozen in 4-bit NF4 (QLoRA). Only matrices A and B (rank r = 16, scaling α = 32) train. Crucially, training mixes ~20% standard English/Swahili examples with Sheng transcripts to prevent catastrophic forgetting.",
        },
      },
    ],
    keyTakeaways: [
      "audit_log and workflow_checkpoints automatically store clean raw data usable later for model evaluation and training.",
      "QLoRA updates < 2% of weights using low-rank adapters while keeping the 4B base model frozen in 4-bit NF4.",
      "Always mix standard EN/SW datasets (~20%) alongside slang examples during fine-tuning to prevent forgetting standard grammar or JSON structure.",
    ],
  },
];

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    term: "Neuro-Symbolic AI",
    plainMeaning: "Combining neural networks (LLMs for messy language) with deterministic code/databases (exact rules & math).",
    whereUsed: "Overall architecture between server/nlu.ts and server/pricing.ts",
  },
  {
    term: "Token & Tokenization",
    plainMeaning: "Breaking input text into small word pieces converted into integer IDs before entering the LLM.",
    whereUsed: "Inside Ollama Qwen3-4B prior to self-attention layers",
  },
  {
    term: "Temperature (T)",
    plainMeaning: "Controls randomness of next-token selection. T=0 is deterministic (extraction); T=0.2 gives controlled phrasing (NLG).",
    whereUsed: "server/nlu.ts (T=0 in extractWithOllama, T=0.2 in synthesizeGroundedReply)",
  },
  {
    term: "Constrained JSON Decoding",
    plainMeaning: "Masking invalid vocabulary tokens during generation so output is guaranteed to match a JSON Schema.",
    whereUsed: "format: SLOT_JSON_SCHEMA in Ollama /api/chat",
  },
  {
    term: "Quantization (Q4_K_M / NF4)",
    plainMeaning: "Compressing 16-bit neural weights into ~4-bit numbers so a 4B model fits in ~3 GB RAM/VRAM.",
    whereUsed: "Ollama runtime (Q4_K_M GGUF) and QLoRA training (4-bit NF4)",
  },
  {
    term: "LangGraph StateGraph",
    plainMeaning: "A directed graph of nodes sharing typed state with conditional routing, loops, and durable pause checkpoints.",
    whereUsed: "python_reference/src/graph.py & server/workflow.ts",
  },
  {
    term: "Greedy Bin-Packing",
    plainMeaning: "Filling the largest available licensed vehicles first to cover all guests using the fewest vehicles and guides.",
    whereUsed: "allocateVehicles() in server/pricing.ts & python_reference/src/pricing.py",
  },
  {
    term: "Idempotency Key",
    plainMeaning: "A unique per-request token ensuring network retries return the saved first result instead of double-booking.",
    whereUsed: "Idempotency-Key header + idempotency_records table",
  },
  {
    term: "TOCTOU Race Condition",
    plainMeaning: "Time-of-Check to Time-of-Use bug where two users read 'available' simultaneously and both book the same asset.",
    whereUsed: "Prevented in persistBookingTransaction() via SQLite BEGIN IMMEDIATE & PostgreSQL btree_gist",
  },
  {
    term: "Ghost Hold",
    plainMeaning: "Inventory accidentally locked by an unapproved or abandoned draft, blocking real paying customers.",
    whereUsed: "Prevented by deferring vehicle_allocations writes until human approval resolves",
  },
  {
    term: "Grounding Guardrail",
    plainMeaning: "Deterministic code verifying that an LLM-written reply matches exact database numbers and booking IDs.",
    whereUsed: "verifyGroundedReply() in server/nlu.ts",
  },
  {
    term: "QLoRA (Low-Rank Adaptation)",
    plainMeaning: "Fine-tuning tiny adapter matrices (B·A) alongside a frozen 4-bit LLM base to specialize slang on modest GPUs.",
    whereUsed: "Model Training page (scripts 01–06)",
  },
];

export function computeArchitectureGuideWordCount(): number {
  const parts: string[] = [];
  for (const row of TECH_STACK_MATRIX) {
    parts.push(row.layer, row.technology, row.roleInApp, row.whyChosen);
  }
  for (const ch of GUIDE_CHAPTERS) {
    parts.push(ch.title, ch.subtitle, ch.executiveSummary, ch.businessImpactMetric, ch.beginnerAnalogy);
    for (const sec of ch.sections) {
      parts.push(sec.heading, ...sec.body);
      if (sec.formulaBox) {
        parts.push(sec.formulaBox.label, sec.formulaBox.expression, sec.formulaBox.explanation);
      }
    }
    parts.push(...ch.keyTakeaways);
  }
  for (const g of GLOSSARY_ENTRIES) {
    parts.push(g.term, g.plainMeaning, g.whereUsed);
  }
  return parts
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
