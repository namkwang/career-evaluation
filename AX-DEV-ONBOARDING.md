# AX팀 개발자 온보딩 가이드

이 문서는 **어떤 프로젝트에서든** Claude Code를 사용하는 AX팀 개발자를 위한 공통 설정 가이드입니다.

---

## 사전 요구사항 체크리스트

시작하기 전에 아래 항목이 모두 완료되어 있어야 합니다:

- 코드 에디터(VS Code/Cursor 등) 설치
- Node.js 20.x 이상 설치 ([다운로드](https://nodejs.org/))
- Git 설치 완료 ([다운로드](https://git-scm.com/))
- 프로젝트 저장소 생성 또는 클론 완료 (`git clone` 후 프로젝트 폴더가 있어야 함)
- 환경변수 파일 생성 또는 수령 완료 (팀 리드에게 `.env` 파일 요청)
- 선택) WSL2 설정 (Windows에서 Linux 환경 사용)

> **확인 방법**: 터미널(Windows: PowerShell / Mac: Terminal)을 열고 아래 명령어를 입력하세요.
>
> ```bash
> node --version   # v20.x.x 이상이 나오면 OK
> git --version    # git version x.x.x가 나오면 OK
> ```
>
> 명령어를 입력하고 Enter를 누르면 결과가 나옵니다. 에러가 나오면 설치가 안 된 것입니다.

---

## Step 1: Claude Code 설치

터미널에서 아래 명령어를 실행합니다:

```bash
npm install -g @anthropic-ai/claude-code
```

> `**npm install -g` 란?** 컴퓨터 전체에서 사용할 수 있도록 프로그램을 설치하는 명령어입니다.

설치 확인(claude는 꼭 프로젝트 루트 경로에서 실행):

```bash
claude --version   # 버전 번호가 나오면 설치 완료. 주기적으로 업데이트 해주셔야 좋습니다.
```

---

## Step 2: 프로젝트 핵심 문서 이해하기

Claude Code는 프로젝트 폴더에 있는 규칙 파일을 **자동으로 읽고 따릅니다**. 각 파일의 역할을 이해해 주세요:

### 팀 공유 파일 (Git에 포함, 모든 프로젝트 공통 적용)


| 파일                      | 무엇인가요?                              | 누가 수정하나요?            |
| ----------------------- | ----------------------------------- | -------------------- |
| `CLAUDE.md`             | 팀 전체가 공유하는 규칙 (코딩 컨벤션, 팀 거버넌스)      | **팀 리드만** (PR 승인 필요) |
| `.claude/commands/`     | 팀 공유 커맨드. 직접 호출해야 함                 | PR 리뷰 필요             |
| `.claude/skills/`       | 팀 공유 커스텀 스킬. CC가 알아서 호출함            | PR 리뷰 필요             |
| `.claude/settings.json` | 팀 permission, 공유 훅 설정 (TDD 규칙 강제 등) | PR 리뷰 필요             |
| `.claude/hooks/(선택)`    | 훅 스크립트 (TDD 리마인더 등)                 | PR 리뷰 필요             |
| `.husky/`               | Git hook 스크립트 (커밋 시 자동 검사)          | PR 리뷰 필요             |
| `commitlint.config.js`  | 커밋 메시지 규칙 정의                        | PR 리뷰 필요             |
| `.gitignore`            | 프로젝트 빌드 결과물, 환경변수, 개인 설정 파일 등       | PR 리뷰 필요             |


### 프로젝트 파일 (Git에 포함, 해당 프로젝트에만 적용)


| 파일                  | 무엇인가요?                     | 누가 수정하나요? |
| ------------------- | -------------------------- | --------- |
| `README.md`         | 프로젝트 상세 정보 (DB 스키마, API 등) | PR 리뷰 필요  |
| `.mcp.json.example` | MCP 토큰 예제 (실제 토큰 미포함)      | PR 리뷰 필요  |
| `.vscode/`          | VS Code 에디터 설정             | PR 리뷰 필요  |


### 개인 파일 (Git에 미포함 = 나만 사용하는 설정)


| 파일                            | 무엇인가요?                             | 누가 수정하나요?      |
| ----------------------------- | ---------------------------------- | -------------- |
| `CLAUDE.local.md`             | 개인 설정 + 프로젝트 특화 정보 (기술 스택, 환경변수 등) | **자유롭게** 수정 가능 |
| `.claude/settings.local.json` | 개인 Permission 설정                   | **자유롭게** 수정 가능 |
| `.mcp.json`                   | 외부 서비스 연결 토큰                       | **자유롭게** 수정 가능 |
| `.env.local`                  | 환경변수 (비밀키, API 키)                  | **자유롭게** 수정 가능 |


> **핵심 규칙**: `CLAUDE.md`는 팀 공유 파일이므로 **절대 개인 설정을 넣지 마세요**.
> 개인 설정은 반드시 `CLAUDE.local.md`에 작성합니다.

### 프로젝트 디렉토리 구조

```
프로젝트 루트/           ← Git이 관리하는 최상위 폴더 (.git이 여기에 있음)
├── .claude/
│   ├── commands/       ← 팀 공유 커맨드 스킬
│   ├── hooks/          ← 훅 스크립트 (TDD 리마인더 등)
│   ├── settings.json   ← 팀 공유 훅 설정
│   └── skills/         ← 커뮤니티 스킬
├── .husky/             ← Git hook 스크립트 (커밋 시 자동 검사)
├── .markdownlint.json  ← 마크다운 lint 설정
├── .oxlintrc.json      ← oxlint 규칙 설정
├── .oxfmtrc.json       ← oxfmt 포맷 설정
├── CLAUDE.md           ← Claude Code 팀 공유 규칙
├── CLAUDE.local.md     ← Claude Code 개인 설정 (Git 미추적)
├── README.md           ← 프로젝트 상세 정보 (DB 구조, API 등)
├── commitlint.config.js ← 커밋 메시지 규칙
├── skills-lock.json    ← 커뮤니티 스킬 버전 관리
├── package.json        ← 프로젝트 의존성 및 스크립트
├── .env.local          ← 환경변수 (Git 미추적)
├── .mcp.json.example   ← MCP 토큰 예제 파일
├── .mcp.json           ← MCP 토큰 설정 (Git 미추적)
└── src/                ← 소스 코드
```

> **이 프로젝트는 플랫 구조**입니다. 별도의 `web/` 하위 폴더 없이 프로젝트 루트에 `package.json`과 `src/`가 있습니다.
> 모든 명령어는 프로젝트 루트에서 바로 실행하면 됩니다.

---

## Step 3: MCP 서버 설정 (외부 도구 연결)

MCP(Model Context Protocol)는 Claude가 외부 서비스(데이터베이스, 문서 등)에 직접 접근할 수 있게 해주는 연결 설정입니다.

### 3-1. 설정 파일 복사

프로젝트 루트에 `.mcp.json.example`이라는 예제 파일이 있습니다. 이를 복사합니다:

```bash
cd 프로젝트폴더                   # 프로젝트 루트로 이동
cp .mcp.json.example .mcp.json  # 예제 파일을 복사해서 내 설정 파일 생성
```

> `.mcp.json.example`이 없다면 아직 MCP 연결이 아무것도 되지 않은 프로젝트입니다.

### 3-2. 토큰 입력

`.mcp.json` 파일을 메모장이나 VS Code로 열어 `<YOUR_..._TOKEN>` 부분을 실제 토큰으로 교체합니다.
토큰 발급 방법은 프로젝트별로 다르므로 팀 리드에게 확인하세요.

### 3-3. 보안 주의사항

**절대 커밋(Git에 업로드)하지 마세요!** `.mcp.json`에는 개인 토큰이 들어있습니다.

> - `.mcp.json`은 `.gitignore`에 포함되어 있어 정상적으로는 커밋되지 않습니다.
> - 만약 Git에서 `.mcp.json`이 추적(커밋 대상)되고 있다면, **즉시 팀 리드에게 알려주세요**.
> - 토큰이 GitHub에 노출되면 **보안 사고**가 발생할 수 있습니다.

---

## Step 4: Permission 모드 설정

Claude Code에는 AI가 얼마나 자율적으로 행동할 수 있는지를 제어하는 **모드**가 있습니다.
자동차의 기어처럼, 상황에 따라 적절한 모드를 선택합니다.

### 모드별 설명


| 모드                             | 무엇을 하나요?                            | 비유                      |
| ------------------------------ | ----------------------------------- | ----------------------- |
| `plan`                         | Claude가 **계획을 먼저 보여주고**, 내가 승인해야 실행 | "이렇게 할까요?" 물어보는 비서      |
| `auto`                         | 파일 수정은 자동, **명령어 실행**은 내 승인 필요      | 서류는 알아서, 중요 결정은 보고하는 비서 |
| `dangerously-skip-permissions` | 모든 것을 자동으로 실행 (주의 필요)               | 완전 자율 비서 (실수도 자동으로 실행됨) |


### 역할별 사용 규칙


| 나의 역할      | 사용할 모드      | 이유                            |
| ---------- | ----------- | ----------------------------- |
| **신입/주니어** | `plan` (필수) | 모든 변경을 확인하며 학습할 수 있음          |
| **시니어**    | `autoEdit`  | 익숙한 작업은 빠르게, 중요한 건 확인         |
| **팀 리드**   | `autoEdit`  | `fullAuto`는 feature 브랜치에서만 허용 |


### 모드 설정 방법

```bash
claude --mode plan  # "claude"만 쳐도 plan 모드로 실행될 수 있도록 단축어를 지정할 수도 있습니다.
```

> **브랜치란?** Git에서 코드의 "복사본"을 만들어 별도로 작업하는 공간입니다.
> `master`/`main`은 실제 서비스 코드, `feature` 브랜치는 새 기능을 만드는 작업 공간입니다.

---

## Step 5: 팀 공유 커맨드 & 스킬 확인

Claude Code에는 두 종류의 스킬이 있습니다:

> **스킬이란?** 특정 작업에 필요한 규칙과 가이드를 Claude에게 한 번에 알려주는 문서입니다.
> 매번 "이런 규칙을 따라서 해줘"라고 설명하지 않아도, 스킬을 호출하면 Claude가 규칙을 자동으로 따릅니다.

### 5-1. Commands (`.claude/commands/`)

직접 호출해 사용하는 프롬프트 모음입니다. Claude Code 대화 중에 `/커맨드이름`으로 호출합니다:

### 5-2. Skills (`.claude/skills/`)

GitHub에 공개된 스킬을 설치해서 사용하거나 직접 작성해 사용할 수 있습니다. 현재 설치된 스킬:


| 스킬                            | 출처                                      | 용도                   |
| ----------------------------- | --------------------------------------- | -------------------- |
| `code-reviewer`               | Shubhamsaboo/awesome-llm-apps           | 코드 리뷰                |
| `frontend-design`             | anthropics/skills                       | 프론트엔드 디자인 가이드        |
| `make-interfaces-feel-better` | jakubkrehel/make-interfaces-feel-better | UI 개선                |
| `tdd-workflow`                | affaan-m/everything-claude-code         | TDD(테스트 주도 개발) 워크플로우 |
| `ui-ux-pro-max`               | nextlevelbuilder/ui-ux-pro-max-skill    | UI/UX 디자인            |
| `web-design-guidelines`       | vercel-labs/agent-skills                | 웹 디자인 가이드라인          |


설치된 스킬은 프로젝트 루트의 `skills-lock.json`에서 관리됩니다.

> **스킬 찾기**: 인기 있는 커뮤니티 스킬은 [skillsmp.com](https://skillsmp.com/)에서 검색하고 설치할 수 있습니다.
> 새 스킬 설치는 팀과 상의 후 진행해 주세요.

---

## Step 6: 동작 확인

모든 설정이 끝났으면 정상 동작을 확인합니다:

```bash
cd 프로젝트폴더   # 프로젝트 폴더로 이동
claude            # Claude Code 실행
```

> Claude Code를 종료하려면 `/exit` 또는 `Ctrl + C`를 입력하세요.

---

## 주의사항 (꼭 읽어주세요)

### 절대 하지 말아야 할 것


| 항목                     | 왜 안 되나요?                                                |
| ---------------------- | ------------------------------------------------------- |
| `CLAUDE.md` 무단 수정      | 팀 리드 승인 없이 수정하면 **다른 팀원 전체**에 영향을 줍니다                   |
| 토큰/비밀키 커밋              | `.mcp.json`, `.env.local` 파일이 GitHub에 올라가면 **보안 사고** 발생 |
| master(main)에서 작업      | 프로덕션(실제 서비스) 코드가 의도치 않게 변경될 수 있습니다                      |
| 개인 설정을 `CLAUDE.md`에 작성 | 나의 개인 선호가 팀 전체 규칙으로 적용되는 사고 발생                          |


### 항상 지켜야 할 것


| 항목                         | 왜 지켜야 하나요?                       |
| -------------------------- | -------------------------------- |
| `plan` 모드 기본 사용            | Claude의 모든 행동을 미리 확인할 수 있어 안전합니다 |
| feature 브랜치 사용             | 실제 서비스 코드를 보호하면서 안전하게 작업할 수 있습니다 |
| 개인 설정은 `CLAUDE.local.md`에만 | 팀 설정과 개인 설정이 섞이는 것을 방지합니다        |


---

## 코드 품질 자동화 (Husky + Linter + Formatter + Commitlint)

프로젝트에는 코드 품질을 자동으로 관리하는 도구들이 설정되어 있습니다.
아래 설정 파일들이 프로젝트에 모두 존재해야 정상 동작합니다.


| 파일                             | 위치                   | 역할                       |
| ------------------------------ | -------------------- | ------------------------ |
| `.husky/pre-commit`            | 프로젝트 루트              | 커밋 시 lint-staged 실행      |
| `.husky/commit-msg`            | 프로젝트 루트              | 커밋 메시지 규칙 검사             |
| `commitlint.config.js`         | 프로젝트 루트              | 커밋 메시지 prefix 정의         |
| `.markdownlint.json`           | 프로젝트 루트              | 마크다운 lint 규칙 설정          |
| `.oxlintrc.json`               | 프로젝트 루트              | oxlint 규칙 설정             |
| `.oxfmtrc.json`                | 프로젝트 루트              | oxfmt 포맷 설정              |
| `package.json` > `lint-staged` | 프로젝트 루트              | lint-staged 대상 파일/명령어 설정 |


설정 파일이 모두 있다면 아래 패키지를 설치하면 활성화됩니다:

```bash
npm install -D husky lint-staged oxlint oxfmt markdownlint-cli2 @commitlint/cli @commitlint/config-conventional
npm run prepare   # husky 초기화 (최초 1회)
```

### 어떤 도구들이 설치되어 있나요?


| 도구                    | 역할                           | 비유                       |
| --------------------- | ---------------------------- | ------------------------ |
| **Husky**             | Git 커밋/푸시 시 자동으로 검사를 실행      | 출입구 경비원 (규칙 안 지키면 통과 불가) |
| **lint-staged**       | 커밋하려는 파일만 골라서 검사             | 경비원이 들고 있는 체크리스트         |
| **oxlint**            | 코드에서 버그, 오류 가능성을 검사          | 코드 맞춤법 검사기               |
| **oxfmt**             | 코드 스타일(들여쓰기, 줄바꿈 등)을 통일      | 코드 자동 정리 도구              |
| **commitlint**        | 커밋 메시지가 팀 규칙에 맞는지 검사         | 커밋 메시지 양식 검사기            |
| **markdownlint-cli2** | 마크다운 문서(.md)의 형식을 검사하고 자동 수정 | 문서 맞춤법/서식 검사기            |


### 자동으로 일어나는 일

**커밋할 때** (pre-commit hook):

1. 변경된 `src/` 내 ts/tsx 파일에 대해 oxfmt로 코드 포맷 자동 수정
2. 변경된 `.md` 파일에 대해 markdownlint-cli2로 문서 서식 자동 수정
3. staged 파일에 대해 oxlint 결과를 **표시만** 함 (커밋 차단 안함)
4. 포맷/마크다운 에러가 있으면 자동 수정 후 커밋 진행

**커밋 메시지 작성 시** (commit-msg hook):

1. 커밋 메시지가 컨벤션에 맞는지 검사
2. 맞지 않으면 **커밋이 차단됨**

### 커밋 메시지 규칙

커밋 메시지는 반드시 아래 prefix 중 하나로 시작해야 합니다:

```
feat: 새 기능 추가           예) feat: 로그인 페이지 추가
fix: 버그 수정               예) fix: 날짜 표시 오류 수정
docs: 문서 수정              예) docs: README 업데이트
style: 코드 포맷팅           예) style: 들여쓰기 정리
refactor: 리팩토링           예) refactor: 로그인 로직 분리
chore: 빌드/설정 변경        예) chore: 패키지 업데이트
test: 테스트 추가            예) test: 로그인 테스트 작성
perf: 성능 개선              예) perf: 이미지 로딩 최적화
ci: CI 관련 수정             예) ci: GitHub Actions 수정
build: 빌드 관련 수정        예) build: webpack 설정 변경
```

> **잘못된 예**: `로그인 기능 추가`, `fixed bug`, `update`
> **올바른 예**: `feat: 로그인 기능 추가`, `fix: 날짜 표시 오류 수정`

### 커밋이 차단되었을 때 대처법

**"lint-staged failed"가 나온 경우**:

```bash
# 에러 메시지를 읽고, 코드를 수정한 후 다시 커밋
git add .
git commit -m "feat: 수정된 코드"
```

> 포맷 에러는 자동 수정됩니다. oxlint 결과는 참고용으로 표시되며 커밋을 차단하지 않습니다.

**"commitlint failed"가 나온 경우**:

```bash
# 커밋 메시지를 규칙에 맞게 다시 작성
git commit -m "feat: 올바른 prefix로 시작하는 메시지"
```

### 수동으로 검사하기

커밋 전에 미리 검사하고 싶다면:

```bash
# 코드 검사 (에러만 표시)
npm run lint

# 코드 검사 + 자동 수정
npm run lint:fix

# 코드 포맷 자동 정리
npm run format

# 포맷이 맞는지만 확인 (수정 안 함)
npm run format:check
```

---

## 온보딩 완료 체크리스트

모든 단계를 완료했는지 최종 확인합니다:

- 환경변수 파일(`.env.local`) 설정 완료
- Claude Code 설치 완료 (`claude --version` 확인)
- `CLAUDE.md`, `README.md`, Linter, Formatter, Commitlint, `.gitignore` 설정 가져오기
- `.claude/commands/`, `.claude/skills/`에 팀 공유 commands와 skills 가져오기
- `.mcp.json.example` 생성 (토큰 자리에 `<YOUR_..._TOKEN>` 플레이스홀더)
- `.mcp.json` 생성 및 토큰 입력 완료, 또는 mcp 설치 완료
- Permission 모드 설정 확인 (기본: `plan`)
- `CLAUDE.local.md` 개인 설정 완료

> 문제가 있으면 팀원에게 문의하세요.
