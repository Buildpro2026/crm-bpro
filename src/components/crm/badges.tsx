import {
  COMPANY_STATUS_BADGE,
  companyStatusLabel,
  isCompanyStatus,
  isDealStage,
  STAGE_BADGE,
  stageLabel,
} from "@/lib/crm";
import { CANDIDATE_STATUS_BADGE, candidateStatusLabel, isCandidateStatus } from "@/lib/candidates";

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

export function StageBadge({ stage }: { stage: string }) {
  const style = isDealStage(stage) ? STAGE_BADGE[stage] : STAGE_BADGE["new lead"];
  return <span className={`${base} ${style}`}>{stageLabel(stage)}</span>;
}

export function CandidateStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status && isCandidateStatus(status) ? status : "new";
  return <span className={`${base} ${CANDIDATE_STATUS_BADGE[value]}`}>{candidateStatusLabel(value)}</span>;
}

export function CompanyStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status && isCompanyStatus(status) ? status : "prospect";
  return <span className={`${base} ${COMPANY_STATUS_BADGE[value]}`}>{companyStatusLabel(value)}</span>;
}
