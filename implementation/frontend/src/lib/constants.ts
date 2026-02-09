// Implements: spec/frontend/chat_area/onboarding/plan.md#sample-dataset-url
export const SAMPLE_DATASET_URL =
  "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/iris.parquet";

export const SAMPLE_PROMPT_CHIPS = [
  "Show me the first 5 rows",
  "What's the average sepal length by species?",
  "Which species has the widest petals?",
] as const;

// ---------------------------------------------------------------------------
// Conversation templates — shown on the onboarding screen
// ---------------------------------------------------------------------------

export interface ConversationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  datasets: Array<{ url: string; name: string }>;
  prompts: string[];
  /** When true, clicking this card opens the PresetSourcesModal instead of auto-loading datasets */
  isPresetTrigger?: boolean;
}

export const CONVERSATION_TEMPLATES: ConversationTemplate[] = [
  {
    id: "iris",
    name: "Iris Flowers",
    description: "Classic ML dataset — explore flower measurements by species",
    icon: "\u{1F338}",
    datasets: [
      {
        url: "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/iris.parquet",
        name: "iris",
      },
    ],
    prompts: [
      "Show me the first 10 rows",
      "What's the average sepal length by species?",
      "Which species has the widest petals?",
    ],
  },
  {
    id: "titanic",
    name: "Titanic Passengers",
    description: "Explore survival data from the Titanic disaster",
    icon: "\u{1F6A2}",
    datasets: [
      {
        url: "https://huggingface.co/datasets/phihung/titanic/resolve/main/data/train-00000-of-00001.parquet",
        name: "titanic",
      },
    ],
    prompts: [
      "What was the survival rate by passenger class?",
      "Show the age distribution of passengers",
      "How did gender affect survival?",
    ],
  },
  {
    id: "nrel",
    name: "NREL ResStock",
    description: "US residential building energy data from NREL",
    icon: "\u26A1",
    datasets: [],
    prompts: [],
    isPresetTrigger: true,
  },
];
