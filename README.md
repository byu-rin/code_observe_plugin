# Code Archaeologist

TypeScript/React 코드에서 변수·함수·모듈·React 상태가 **어디서 왔는지** 추적하고, Mermaid 의존성 그래프로 보여주는 Claude Code 플러그인입니다.

## 설치

```
/plugin marketplace add byu-rin/code_observe_plugin
/plugin install code-archaeologist@code-archaeologist-marketplace
/reload-plugins
```

**첫 실행 시** `SessionStart` 훅이 `npm install`과 빌드를 자동으로 수행합니다.

개발 중에는 로컬 로드도 가능합니다:
```bash
claude --plugin-dir /path/to/code_observe_plugin
```

## 사용법

```
/code-archaeologist:trace <symbol>
```

예시:
```
/code-archaeologist:trace count
/code-archaeologist:trace ThemeContext
/code-archaeologist:trace fetchUser
```

자율 추적을 위해서는 `@code-archaeologist` 에이전트를 사용하세요:
```
@code-archaeologist
이 앱에서 theme 상태는 어디서 오는 거야?
```

## 기능

| 기능 | 설명 | 도구 |
| :-- | :-- | :-- |
| **변수 추적** | 선언 위치 + 모든 참조 (import/export/재-export) | `trace_variable` |
| **import 그래프** | 모듈 의존성 체인 (path alias·barrel 자동 해석) | `analyze_imports` |
| **호출 흐름** | 함수 호출 계층 — 누가 부르는지(상류)/무엇을 부르는지(하류) | `trace_call_flow` |
| **React 상태 흐름** | `useState`/`useReducer` + setter + prop 전달, `useContext` + Provider/Consumer | `trace_state_flow` |
| **자율 추적** | 서브에이전트가 도구를 이어가며 다중 홉 추적 | `code-archaeologist` 에이전트 |

### 도구 (MCP)

#### `trace_variable` — 이 심볼은 어디서 왔나?
- 인자: `symbol`, `filePath`(선택), `projectRoot`(선택)
- 결과: 선언 위치, 모든 참조(import/export/사용으로 분류), 파일별 Mermaid 그래프

#### `analyze_imports` — 이 모듈은 무엇에 의존하나?
- 인자: `entryFile`, `maxDepth`(선택, 기본 3), `projectRoot`(선택)
- 결과: 모듈 의존성 체인 (path alias·barrel 자동 해석, node_modules는 leaf 노드, 순환 탐지)

#### `trace_call_flow` — 이 함수는 누가 부르나?
- 인자: `symbol`, `direction`(선택, `callers`/`callees`, 기본 `callers`), `filePath`(선택), `maxDepth`(선택)
- 결과: 상류(callers) 또는 하류(callees) 호출 체인 (재귀·순환 안전, 깊이 제한)

#### `trace_state_flow` — React 상태는 어떻게 흐르나?
- 인자: `symbol`, `filePath`(선택), `projectRoot`(선택)
- 결과: `useState`/`useReducer` 상태+setter+호출 지점, `useContext`↔`createContext`↔Provider 연결, 자식 컴포넌트로의 prop 전달

### 자율 추적: `@code-archaeologist` 에이전트

깊은 다중 홉 조사가 필요할 때:

```
@code-archaeologist
이 앱에서 theme 상태는 어디서 오는 거야?
```

에이전트는 시작 도구를 고르고 → 결과에서 빈틈을 찾고 → 필요하면 다른 도구를 이어 호출하고 → 전체 경로를 합쳐 답합니다.

## 한계

**추적 가능**: 단순 식별자(변수·함수·const), import/export 체인(재-export·alias 포함), 함수 선언·호출, React 훅(`useState`/`useReducer`/`useContext`/`createContext`), 컴포넌트 prop.

**추적 불가**: 동적 import(`require(변수)`), 문자열 키 접근, 타입 전용 export, HOC·render props, 조건부로 렌더되는 Context, 외부 모듈(node_modules는 leaf로만 표시).

> 한계에 부딪히면 결과의 **Notes**에 명시하므로, 그래프가 불완전한 경우를 바로 알 수 있습니다.

## 요구 사항

- **Node.js 18+**
- **`tsconfig.json`이 있는 TypeScript 프로젝트**
- React (`trace_state_flow`에만 필요, 선택)

플러그인은 `tsconfig.json`의 `include` 범위에 있는 `.ts`, `.tsx`, `.js`, `.jsx` 파일을 분석합니다.

## 개발

```bash
git clone <repo>
cd code_observe_plugin

# 설치 및 빌드
cd server && npm install && npm run build && cd ..

# Claude Code에서 로드
claude --plugin-dir .

# 테스트
cd server && npm test
```

### 프로젝트 구조

```
code_observe_plugin/
├── .claude-plugin/          # plugin.json, marketplace.json
├── server/                  # MCP 서버
│   ├── src/analysis/        # 분석기 (변수·import·호출흐름·react-hooks)
│   ├── src/output/          # 렌더러 (mermaid·markdown)
│   ├── src/mcp/             # 도구 등록
│   └── test/                # 픽스처 + 테스트 (20+개)
├── skills/trace/SKILL.md    # 스킬 진입점
├── agents/                  # 자율 에이전트
└── hooks/                   # SessionStart 부트스트랩
```

## 라이선스

MIT

---

**시작하기:** 아무 심볼에나 `/code-archaeologist:trace`를 실행하거나, `@code-archaeologist`로 깊은 추적을 맡겨 보세요.
