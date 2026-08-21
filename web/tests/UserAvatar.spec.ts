import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from '@/components/UserAvatar.vue'

describe('UserAvatar', () => {
  it('shows two initials from full name when no avatar', () => {
    const wrapper = mount(UserAvatar, {
      props: {
        user: { name: 'Neila Vallenilla', email: 'neila@test.com', avatarUrl: null }
      }
    })
    expect(wrapper.text()).toBe('NV')
  })

  it('shows up to two letters for a single name', () => {
    const wrapper = mount(UserAvatar, {
      props: { user: { name: 'Ana', email: 'ana@test.com', avatarUrl: null } }
    })
    expect(wrapper.text()).toBe('AN')
  })

  it('renders image when avatarUrl exists', () => {
    const wrapper = mount(UserAvatar, {
      props: { user: { name: 'Ana', email: 'ana@test.com', avatarUrl: 'https://example.com/a.jpg' } }
    })
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/a.jpg')
  })
})
