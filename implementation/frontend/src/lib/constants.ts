// Implements: spec/frontend/chat_area/onboarding/plan.md#sample-dataset-url
export const SAMPLE_DATASET_URL =
  "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/iris.parquet";

export const SAMPLE_PROMPT_CHIPS = [
  "Show me the first 5 rows",
  "What's the average sepal length by species?",
  "Which species has the widest petals?",
] as const;
