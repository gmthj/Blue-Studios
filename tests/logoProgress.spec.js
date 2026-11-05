import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LogoProgress from '../src/components/LogoProgress.vue'

// Component tests: the Blue Studios logo that fills up as a progress bar

const bar = (props) => mount(LogoProgress, { props })

describe('Component test: LogoProgress', () => {
  it('Test1: is a progress bar that reports how full it is, as a percentage', () => {
    const logo = bar({ progress: 0.4 })
    const progress = logo.find('[role="progressbar"]')
    expect(progress.exists()).toBe(true)
    expect(progress.attributes('aria-valuenow')).toBe('40')
    expect(progress.attributes('aria-valuemin')).toBe('0')
    expect(progress.attributes('aria-valuemax')).toBe('100')
  })

  it('Test2: starts empty and ends full', () => {
    expect(bar({ progress: 0 }).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
    expect(bar({ progress: 1 }).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
  })

  it('Test3: follows the progress as it changes', async () => {
    const logo = bar({ progress: 0.1 })
    await logo.setProps({ progress: 0.75 })
    expect(logo.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('75')
  })

  it('Test4: a number outside 0 to 1 is kept inside the bar, and a missing one counts as empty', () => {
    expect(bar({ progress: -2 }).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
    expect(bar({ progress: 3 }).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
    expect(bar({}).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  })

  it('Test5: rounds to a whole percent', () => {
    expect(bar({ progress: 0.456 }).find('[role="progressbar"]').attributes('aria-valuenow')).toBe('46')
  })

  it('Test6: is named for screen readers, and the name can be changed', () => {
    expect(bar({ progress: 0.5 }).find('[role="progressbar"]').attributes('aria-label')).toBe('Making the file')
    expect(bar({ progress: 0.5, label: 'Loading the strip' }).find('[role="progressbar"]').attributes('aria-label')).toBe('Loading the strip')
  })

  it('Test7: draws the logo twice, the pale one and the full colour one, and says nothing extra to screen readers', () => {
    const images = bar({ progress: 0.5 }).findAll('img')
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image.attributes('src')).toBe('/images/logo-mark-large.png')
      expect(image.attributes('alt')).toBe('') // decoration: the bar itself carries the meaning
    }
  })

  it('Test8: shows no percentage text', () => {
    expect(bar({ progress: 0.4 }).text()).toBe('')
  })
})
