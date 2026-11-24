import { describe, expect, it } from 'vitest'
import { hasUnsavedFormInput } from '../providers'

describe('hasUnsavedFormInput — REQ-293', () => {
  it('未変更のフォームは dirty と判定しない', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <input type="text" value="初期値" />
      <textarea>初期値</textarea>
      <input type="checkbox" checked />
    `

    expect(hasUnsavedFormInput(root)).toBe(false)
  })

  it('input・textarea・checkbox の変更を dirty と判定する', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <input id="text" type="text" />
      <textarea id="textarea"></textarea>
      <input id="checkbox" type="checkbox" />
    `

    const input = root.querySelector<HTMLInputElement>('#text')!
    input.value = '入力中'
    expect(hasUnsavedFormInput(root)).toBe(true)

    input.value = ''
    const textarea = root.querySelector<HTMLTextAreaElement>('#textarea')!
    textarea.value = '入力中'
    expect(hasUnsavedFormInput(root)).toBe(true)

    textarea.value = ''
    const checkbox = root.querySelector<HTMLInputElement>('#checkbox')!
    checkbox.checked = true
    expect(hasUnsavedFormInput(root)).toBe(true)
  })

  it('選択済みファイルと contenteditable の入力を dirty と判定する', () => {
    const fileRoot = document.createElement('div')
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
    })
    fileRoot.append(fileInput)
    expect(hasUnsavedFormInput(fileRoot)).toBe(true)

    const editableRoot = document.createElement('div')
    editableRoot.innerHTML = '<div contenteditable="true">編集中</div>'
    expect(hasUnsavedFormInput(editableRoot)).toBe(true)
  })
})
