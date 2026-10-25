// GET /api/v1/repos (REQ-API-02).

export interface RepoItem {
  name: string;
  branches: string[];
}

export interface ReposResponse {
  items: RepoItem[];
}
