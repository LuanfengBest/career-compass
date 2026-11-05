import type { Workspace } from "./model";
export const emptyWorkspace: Workspace = {
  version: 2,
  jobs: [],
  applications: [],
  contacts: [],
  outreach: [],
  profile: { name: "", background: "" },
  preferences: { excludeTikTok: false, hideNoSponsor: true },
  emailPaused: true,
};
