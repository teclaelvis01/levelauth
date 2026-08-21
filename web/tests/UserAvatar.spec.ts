import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from '@/components/UserAvatar.vue'

describe('UserAvatar', () => {
  it('shows fallback initial when no avatar', () => {
    const wrapper = mount(UserAvatar, {
      props: { user: { name: 'Ana', email: 'ana@test.com', avatarUrl: null } }
    })
    expect(wrapper.text()).toContain('A')
  })

  it('renders image when avatarUrl exists', () => {
    const wrapper = mount(UserAvatar, {
      props: { user: { name: 'Ana', email: 'ana@test.com', avatarUrl: 'https://example.com/a.jpg' } }
    })
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/a.jpg')
  })
})
