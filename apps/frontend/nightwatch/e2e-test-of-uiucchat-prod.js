/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- this is our only js file so far, just don't bother with types.
describe('prod chat smoke test', function () {
  before(function (browser) {
    browser.options.desiredCapabilities['goog:chromeOptions'] = {
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    }
  })

  it('sends a message and receives a response', function (browser) {
    const testMessage = `e2e smoke test ${Date.now()}`

    browser
      .url('https://www.uiuc.chat/ece120/chat')
      .waitForElementVisible('textarea', 30000)
      .clearValue('textarea')
      .setValue('textarea', testMessage)
      .keys(browser.Keys.ENTER)
      .waitForElementVisible('[class*="prose"]', 60000)
      .getText('[class*="prose"]', function (result) {
        const responseText = String(result.value ?? '')
        this.assert.ok(
          responseText.length > 0,
          'Assistant response should not be empty',
        )
      })
      .end()
  })
})
