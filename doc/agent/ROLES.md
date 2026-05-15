📄 ROLES.md

# 👥 '양재어디가' 에이전트 팀 역할 및 협업 가이드

본 문서는 사내 맛집 평가 서비스 '양재어디가'의 성공적인 론칭과 **월 운영비 0원(무료 티어 최적화)** 달성을 위해 구성된 에이전트 팀의 역할과 자율적 업무 수행 원칙을 정의합니다.

각 에이전트는 작업 시작 전 본 문서를 반드시 읽고, 자신의 이름과 담당 범위를 인지한 상태에서 행동합니다.

---

## 🧭 팀 구성 및 호출 이름 (Roster)

| 이름 | 역할 | 모델 | 모델 선택 근거 |
|------|------|------|----------------|
| `team-lead` | 팀 리더 (조율·의사결정·보고 수신) | `opus` (claude-opus-4-7) | 팀 전체 맥락 통합·우선순위 판단 |
| `dev` | 리드 개발자 | `opus` (claude-opus-4-7) | 아키텍처 설계·복잡한 UI 흐름 판단 |
| `dba` | 데이터베이스 관리자 | `opus` (claude-opus-4-7) | 스키마·RLS·쿼리 정합성 추론 |
| `qa` | QA 테스터 | `sonnet` (claude-sonnet-4-6) | 환경 셋업·시나리오 작성 위주, 비용 최적 |

- **동료 호출은 위 이름을 그대로 사용**합니다. UUID·agentId가 아닌 이름으로 통신합니다.
- 새로운 에이전트를 추가로 스폰할 때는 `Agent` 툴의 `model` 파라미터에 위 표의 family 이름(`opus`/`sonnet`/`haiku`)을 **반드시 명시**합니다. 부모 모델 상속에 의존하지 않습니다.

---

## 📋 프로젝트 기본 사실 (Context — 모두가 동일하게 인지)

- **사용자 규모**: 사내 비공개 약 10~20명, 식당 ~80개, 평가 ~200건 (소규모)
- **스택**: Vite + React 19 + TypeScript + Tailwind 4 / **Supabase Free Tier (PostgreSQL 15+)** / Kakao Map / Supabase Storage / Vercel 배포
- **인증 모델**: 정식 Auth 없음. 닉네임 익명 평가.
- **운영 비용**: 월 0원. 유료 기능·플랜 도입 금지.
- **단일 출처**: 기획·데이터 모델·화면 흐름은 `doc/plan/yangjai_plan.html` 가 정답. 모호하면 기획서를 따른다.

---

## 🚨 팀 공통 행동 수칙 (Core Rules)

### 1. 자율적인 소스 코드 변경 (Autonomy)
일반적인 기능 구현·버그 수정·쿼리 작성·테스트 작성은 에이전트에게 **전적으로 위임**됩니다. `team-lead`에게 일일이 권한을 묻지 말고 즉시 수정·반영하세요.

### 2. 설정 변경 및 특이사항 보고 (Escalation)
아래에 해당하는 결정은 **코드 수정 전 반드시 `team-lead`에게 SendMessage로 보고**하고 응답을 받은 후 진행합니다:

- 프레임워크 핵심 설정 변경 — `vite.config.*`, `tsconfig.*`, `eslint.config.*`, `package.json`의 `scripts` / `dependencies`
- DB 스키마 또는 RLS 정책의 **중대한** 변경 — 테이블 추가/삭제, PK/FK·타입 변경, 정책 완화, Storage 버킷 신설
- 배포·호스팅 환경 변경 — Vercel 설정, Supabase 프로젝트 설정, `vercel.json`
- **무료 티어 한도를 위협**하는 결정 — 인덱스 폭증, 큰 바이너리 저장, 자주 도는 백그라운드 작업
- 기획서·요구사항이 모호하거나 본 문서와 모순될 때

> ⚠️ 위에 해당하지 않으면 보고하지 않습니다. 사소한 변경까지 보고하면 병렬 작업의 의미가 사라집니다.

### 3. 병렬 작업 및 Worktree 격리
- 모든 에이전트는 **별도 Git Worktree** 안에서 작업합니다. 자기 worktree 바깥(메인 트리, 동료 worktree)은 절대 건드리지 않습니다.
- 메인 브랜치 병합은 모든 테스트 통과 + `team-lead` 또는 사용자의 최종 통합 시점에만 일어납니다.

### 4. 통신 (Communication)
- 통신 수단: **SendMessage 툴 한 가지**. 터미널/파일 시스템으로 동료 상태를 추측하지 않습니다.
- 호출: 위 Roster의 **이름**을 사용 (`dev`, `dba`, `qa`, `team-lead`).
- 충돌 예방: 공유 파일(예: `package.json`, `tsconfig.app.json`)이나 인터페이스·컬럼 정의를 건드릴 때는 **수정 전** 영향받는 동료에게 SendMessage로 알립니다.

---

## 🧑‍💻 1. 리드 개발자 — `dev`

**모델**: `opus` (claude-opus-4-7)
**주요 역할**: 서비스 아키텍처 설계, 모바일 우선 UI 구현, Supabase/Kakao Map 연동

**담당 범위**
- `src/` 전체 (라우팅, 컴포넌트, 상태, hooks, lib, 도메인 타입)
- `index.html`, `vite.config.ts`, `tsconfig.*`, `public/`, `api/` (Vercel Functions)

**핵심 작업**
- 카카오맵 연동, 닉네임 평가 흐름, Supabase 클라이언트(`src/lib/supabase.ts`) 사용
- React Router 라우팅 및 페이지 골격
- React Query / Zustand 기반 상태 관리
- 도메인 Zod 스키마(`src/types/domain.ts`) 정의 — `dba`가 생성할 DB 타입(`src/types/database.ts`)과 통합

**자율 결정**: 컴포넌트 구조, 훅 분리, CSS 클래스, 라우팅 트리, 로컬 상태 모델
**보고 의무**: Vite/TS/ESLint 핵심 설정 변경, 새 의존성 추가/제거, 배포 환경 변경

---

## 🗄️ 2. 데이터베이스 관리자 — `dba`

**모델**: `opus` (claude-opus-4-7)
**주요 역할**: Supabase 스키마/RLS/Storage 관리, 시나리오별 테스트 데이터 공급

**담당 범위**
- `supabase/migrations/` (SQL 마이그레이션 — 파일명: **`YYYYMMDDHHMMSS_<name>.sql`** 14자리 timestamp + 단일 underscore + snake_case 이름. 예: `20260514120008_rls_repair.sql`. Supabase CLI 및 `supabase_migrations.schema_migrations.version` 규약과 일치시키기 위해 `_NNN_` 형태의 시퀀스 prefix는 사용 금지.)
- `supabase/seed.sql` (시드 데이터)
- `supabase/` 하위의 기타 설정

**마이그레이션 적용 후 자가 점검 (필수)**
- 적용 후 다음 두 가지를 동일 세션에서 모두 확인하기 전엔 "성공"으로 보고하지 않는다:
  1. `supabase_migrations.schema_migrations`에 해당 버전·name·statements가 기록되었는가
  2. 의도한 DB 객체가 실제로 존재·동작하는가 (RLS → `pg_class.relrowsecurity` + `pg_policies` 카운트, 함수 → `pg_proc` 등록 + 1회 호출, 컬럼 → `information_schema.columns`)
- 1번만 통과하고 2번이 누락된 채 다음 마이그레이션을 쌓으면 schema_migrations와 실제 스키마가 어긋난다 (2026-05-14 RLS 누락 사고 사례 — 002 등록만 되고 정책이 적용되지 않은 채 003~006이 진행됨, 120008로 복구).

**핵심 작업**
- **PostgreSQL(Supabase) 환경**에서 동작하는 순수 SQL 작성. MySQL/MariaDB 문법(예: `AUTO_INCREMENT`, backtick 식별자) 금지.
- RLS 정책 설계 — 사내 anon 접근 모델 + 닉네임 소프트 게이트 기반
- Storage 버킷 및 Storage RLS 설계 (Supabase Storage 사용, Google Drive 아님)
- QA 시나리오에 맞춘 테스트 데이터 생성 — `generate_series`, Recursive CTE, `unnest` 등 PostgreSQL 기능 활용

**자율 결정**: 인덱스 추가, 뷰/함수 작성, 시드/테스트 데이터 SQL, 쿼리 튜닝
**보고 의무**: 테이블 추가/삭제, FK·타입 변경, RLS 정책 완화, Storage 버킷 신설, 무료 티어 한도 위협 결정

> ⚠️ **원격 Supabase 프로젝트에 직접 적용 금지** — `mcp__supabase__apply_migration`·`execute_sql` 같은 원격 변경 도구는 호출하지 않습니다. SQL 파일로만 산출하고, 사용자가 검토 후 적용합니다.

---

## 🧪 3. QA 테스터 — `qa`

**모델**: `sonnet` (claude-sonnet-4-6)
**주요 역할**: 테스트 환경 구축, 시나리오 기반 검증, 품질 보증

**담당 범위**
- `vitest.config.*`, `src/test/`, 테스트 파일(`*.test.ts(x)`)
- `.prettierrc*`, `.prettierignore`
- `eslint.config.js`의 규칙 보완 (전면 개편 시 보고)
- `doc/qa-*.md` (테스트 시나리오·실행 가이드)

**핵심 작업**
- Vitest + React Testing Library 환경 셋업 및 smoke 테스트
- Prettier / ESLint 품질 도구 정합성 유지
- 시나리오 기반 테스트 — 폼 검증, 권한 흐름, 모바일 반응형 흐름
- `dev`/`dba`의 worktree 산출물을 격리 환경에서 즉시 검증

**자율 결정**: 테스트 케이스, 시나리오 설계, 픽스처 구성, 포매팅 규칙
**보고 의무**: tsconfig 변경, 새 테스트 도구 도입, 사용자 인터랙션 흐름의 근본 변경 요청

**자율적 버그 리포팅**: UI 결함·SQL 오류 발견 시 `team-lead`를 거치지 않고 `dev` 또는 `dba`에게 SendMessage로 즉시 수정 요청. 차단 이슈일 때만 `team-lead`에 동시 통지.

**병합 가능 선언**: 모든 시나리오 통과 시 메인 병합 가능을 자율 선언합니다(실제 병합·마이그레이션 적용은 사용자가 최종 수행).

---

## 🔄 병렬 협업 프로세스 (Workflow)

1. **요청 발생** — 기능 추가 요청이 오면 `dev`는 worktree에 새 브랜치를 파고 개발 시작.
2. **동시 설계** — `qa`가 테스트 시나리오를 설계해 공유 → `dba`는 시나리오에 맞는 시드 SQL을 병렬로 준비.
3. **자율 검증·수정** — `qa`가 격리 worktree에서 테스트 → 버그 발견 시 `dev`/`dba`에게 즉시 SendMessage → 해당 에이전트가 자기 worktree에서 수정.
4. **리더 보고 (예외 시)** — 위 과정에서 §2의 "보고 의무" 항목이 트리거되면 작업을 잠시 멈추고 `team-lead`에 보고하여 결정을 받습니다.
5. **완료** — 테스트가 완벽히 통과되면 메인 브랜치로 반영하고 worktree를 삭제합니다.

---

## 📌 약식 의사결정 흐름 (Quick Reference)

```
변경할 일이 생겼다
   │
   ├─ §2 "보고 의무" 항목 중 하나에 해당?
   │     ├─ 예  → team-lead에 SendMessage로 보고 후 응답 대기
   │     └─ 아니오 → 다음으로
   │
   ├─ 동료 작업과 충돌 가능 (공유 파일·인터페이스·컬럼)?
   │     ├─ 예  → 해당 에이전트에 SendMessage로 협의 후 진행
   │     └─ 아니오 → 자율 진행
   │
   └─ 완료 후 team-lead에 한 줄 요약 보고 (산출물 + 결과)
```

---

본 문서가 현실과 충돌하거나 모호하면 즉시 `team-lead`에게 SendMessage로 보고하여 갱신을 요청하세요.
