// Conversation workflow templates for guided data analysis.
// These templates provide pre-built analysis workflows that users can
// select when starting a new conversation with datasets already loaded.
// Each template includes suggested prompts relevant to the workflow.

export interface ConversationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // SVG path data for inline icons
  suggestedPrompts: string[];
  requiredDatasets: number; // Minimum datasets needed (0 = none required)
}

const templates: ConversationTemplate[] = [
  {
    id: "quick-explore",
    name: "Quick Explore",
    description: "Get a quick overview of your data",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    requiredDatasets: 1,
    suggestedPrompts: [
      "What columns does this dataset have and what do they mean?",
      "Show me the first 10 rows",
      "What are the basic statistics for all numeric columns?",
      "Are there any missing values or nulls?",
    ],
  },
  {
    id: "compare-datasets",
    name: "Compare Datasets",
    description: "Compare structure and content of two datasets",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    requiredDatasets: 2,
    suggestedPrompts: [
      "Compare the schemas of both datasets",
      "What columns do they have in common?",
      "Join the datasets on their matching columns and show the first 20 rows",
      "Which rows are in one dataset but not the other?",
    ],
  },
  {
    id: "time-series",
    name: "Time Series Analysis",
    description: "Analyze trends and patterns over time",
    icon: "M3 12l3-3 4 4 4-8 4 4 3-3",
    requiredDatasets: 1,
    suggestedPrompts: [
      "What date or timestamp columns exist?",
      "Show me the data distribution over time",
      "What's the trend for numeric columns over time?",
      "Are there any seasonal patterns or anomalies?",
    ],
  },
  {
    id: "data-quality",
    name: "Data Quality Audit",
    description: "Check data completeness and consistency",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    requiredDatasets: 1,
    suggestedPrompts: [
      "Count null values in every column",
      "Find duplicate rows if any",
      "Check for outliers in numeric columns",
      "What's the cardinality of each text column?",
    ],
  },
  {
    id: "distribution",
    name: "Distribution Analysis",
    description: "Understand the distribution of your data",
    icon: "M3 21h18M3 21V3m0 18l4-4v4m4 0V9m0 12l4-8v8m4 0V5m0 16",
    requiredDatasets: 1,
    suggestedPrompts: [
      "Show the distribution of each numeric column",
      "What are the most common values in each text column?",
      "Create a histogram of the primary numeric column",
      "Calculate percentiles (25th, 50th, 75th, 95th) for numeric columns",
    ],
  },
];

export function getConversationTemplates(): ConversationTemplate[] {
  return [...templates];
}
