import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'

export default function NotFoundPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-5xl" aria-hidden>
          🍽️
        </p>
        <h1 className="mt-4 text-xl font-bold text-ink-900">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          주소가 잘못되었거나 삭제된 페이지입니다.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-button bg-brand-primary px-5 py-2.5 text-sm font-medium text-white"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </AppShell>
  )
}
