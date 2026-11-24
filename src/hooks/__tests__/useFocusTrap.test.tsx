import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from '../useFocusTrap'

function TestDialog({
  onClose,
  resetKey,
  onReset,
}: {
  onClose: () => void
  resetKey: number
  onReset: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true, resetKey)

  return (
    <div ref={dialogRef} role="dialog" aria-label="テストダイアログ">
      <button type="button" onClick={onClose}>閉じる</button>
      <button type="button" onClick={onReset}>内容を切り替える</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>開く</button>
      {open && (
        <TestDialog
          onClose={() => setOpen(false)}
          resetKey={resetKey}
          onReset={() => setResetKey((value) => value + 1)}
        />
      )}
    </>
  )
}

describe('useFocusTrap', () => {
  it('resetKey が変わっても、閉じたときは最初のトリガーへフォーカスを戻す', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: '開く' })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '内容を切り替える' }))
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(trigger).toHaveFocus()
  })
})
