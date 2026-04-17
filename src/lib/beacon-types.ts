export type BeaconClassification = "major" | "minor" | "patch" | "chore" | "ignore";

export type BeaconProduct = {
  slug: string;
  name: string;
  tagline: string;
  github_repo_url: string;
  current_version: string;
  last_scanned_at?: string | null;
  archived?: boolean;
};

export type BeaconDraftCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  llm_suggestion: BeaconClassification;
  llm_rationale: string;
  classification: BeaconClassification | null;
};

export type BeaconQuizQuestion = {
  id: string;
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
};

export type BeaconOverviewFeature = { title: string; description: string };

export type BeaconGeneratedContent = {
  release_notes: string;
  overview?: {
    problem: string;
    features: BeaconOverviewFeature[];
    functionality: string;
  };
  quiz: BeaconQuizQuestion[];
};

export type BeaconDraft = {
  id: string;
  product_slug: string;
  commits: BeaconDraftCommit[];
  proposed_version: string;
  release_type: "major" | "minor";
  generated_content?: BeaconGeneratedContent;
  updated_at: string;
};

export type BeaconRelease = {
  product_slug: string;
  product_name?: string;
  version: string;
  type: "major" | "minor";
  published_at: string;
  approved_by: string;
};

export type BeaconReleaseContent = BeaconRelease & {
  release_notes: string;
  overview?: {
    problem: string;
    features: BeaconOverviewFeature[];
    functionality: string;
  };
  quiz?: BeaconQuizQuestion[];
};
