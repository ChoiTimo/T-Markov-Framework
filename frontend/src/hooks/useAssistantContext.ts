/**
 * useAssistantContext — Phase 3 Sprint 3-1
 *
 * surface 페이지에서 호출해 패널이 자동으로 컨텍스트(proposal_id 등) 를 갖게 한다.
 * 단순 패스스루 훅 — 상위 컴포넌트가 useParams 등으로 추출한 값을 그대로 묶어 반환.
 */
import { useMemo } from "react";
import type { AssistantContext, AssistantSurface } from "@/types/ai";

export function useAssistantContext(
  surface: AssistantSurface,
  surfaceRefId?: string | null,
  label?: string,
): AssistantContext {
  return useMemo(
    () => ({
      surface,
      surfaceRefId: surfaceRefId ?? null,
      label,
    }),
    [surface, surfaceRefId, label],
  );
}
