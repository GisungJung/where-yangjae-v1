/**
 * 전역 Error Boundary (기획서 §11.2)
 *
 * - React 19까지 Error Boundary는 여전히 클래스 컴포넌트로만 정의 가능.
 * - 페이지 전체 fallback: "오류가 발생했어요" + 새로고침 + 홈 링크.
 * - Suspense의 lazy import 실패도 포착해 흰 화면 방지.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 운영 환경에서는 별도 수집기로 보낼 자리. 사내 서비스라 콘솔 충분.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto flex min-h-[60vh] w-full max-w-screen-md flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-5xl" aria-hidden>
            🍳
          </p>
          <h1 className="mt-4 text-xl font-bold text-ink-900">
            오류가 발생했어요
          </h1>
          <p className="mt-2 max-w-sm text-sm text-ink-500">
            잠시 후 다시 시도해 주세요. 계속 발생하면 관리자에게 알려주세요.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-w-full overflow-auto rounded-card border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-button bg-brand-primary px-4 py-2 text-sm font-medium text-white"
            >
              새로고침
            </button>
            <Link
              to="/"
              onClick={this.handleReset}
              className="rounded-button border border-surface-border bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            >
              홈으로
            </Link>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
