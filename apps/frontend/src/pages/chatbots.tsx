import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { buttonVariants } from '~/components/shadcn/ui/button'
import { cn } from '~/components/shadcn/lib/utils'
import { LoadingSpinner } from '~/components/UIUC-Components/LoadingSpinner'
import { MainPageBackground } from '~/components/UIUC-Components/MainPageBackground'
import { ChatbotsGlobalNav } from '~/components/UIUC-Components/chatbots-hub/ChatbotsGlobalNav'
import { ChatbotsHeroSection } from '~/components/UIUC-Components/chatbots-hub/ChatbotsHeroSection'
import { ChatbotsSearchBar } from '~/components/UIUC-Components/chatbots-hub/ChatbotsSearchBar'
import { ChatbotsFilterPanel } from '~/components/UIUC-Components/chatbots-hub/ChatbotsFilterPanel'
import { ChatbotsSearchResults } from '~/components/UIUC-Components/chatbots-hub/ChatbotsSearchResults'
import { ChatbotsSection } from '~/components/UIUC-Components/chatbots-hub/ChatbotsSection'
import {
  type ChatbotProjectType,
  type SearchChatbotsParams,
  PROJECT_TYPE_TO_SECTION,
  DEFAULT_ACCESSIBLE_SECTION,
  PAGED_SECTIONS,
} from '~/components/UIUC-Components/chatbots-hub/chatbots.types'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { useFetchFeaturedChatbots } from '~/hooks/queries/useFetchFeaturedChatbots'
import { useSearchChatbots } from '~/hooks/queries/useSearchChatbots'
import { compareChatbotTagPrecedence } from '~/utils/chatbotTagSort'

/** Card → synthetic ChatbotTag[] for precedence sorting (org first, then projectType). */
function cardSortTags(card: { organization?: string; projectType?: string }) {
  const tags: { category: 'organization' | 'projectType'; value: string }[] = []
  if (card.organization)
    tags.push({ category: 'organization', value: card.organization })
  if (card.projectType)
    tags.push({ category: 'projectType', value: card.projectType })
  return tags
}

// Button to create a new chatbot, shown when the user has no bots of their own.
const createFirstChatbot = (
  <div className="flex flex-col items-center gap-6 py-10 text-center">
    <p className="text-lg text-(--illinois-storm-dark) dark:text-[#c8d2e3]">
      You don&apos;t have any chatbots yet.
    </p>
    <Link
      href="/new"
      className={cn(
        buttonVariants(),
        'h-10 gap-2 bg-(--illinois-blue) px-8 text-sm text-white hover:bg-(--foreground-dark) dark:bg-white dark:text-(--illinois-blue) dark:hover:bg-[#e5e7eb]',
      )}
    >
      <Sparkles className="h-4 w-4" />
      Create Your First Chatbot
    </Link>
  </div>
)

function hasActiveSearch(params: SearchChatbotsParams): boolean {
  return Boolean(
    params.q || params.category || params.privacy || params.my_bots,
  )
}

const ChatbotsHubPage = () => {
  const router = useRouter()
  const auth = useAuth()
  const { course_name } = router.query

  const [searchParams, setSearchParams] = useState<SearchChatbotsParams>({})
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)

  const isSearchActive = hasActiveSearch(searchParams)

  const handleParamsChange = useCallback((next: SearchChatbotsParams) => {
    setSearchParams(next)
  }, [])

  const handleToggleFilters = useCallback(() => {
    setIsFiltersOpen((prev) => !prev)
  }, [])

  // Server-side search (only fires when a search/filter is active)
  const {
    data: searchData,
    isLoading: isSearchLoading,
    isError: isSearchError,
  } = useSearchChatbots(searchParams, {
    enabled: auth.isAuthenticated && isSearchActive,
  })

  // Default view: four server-paged sections plus the featured Public Bots sample.
  const { data: featuredChatbots, isLoading: isFeaturedLoading } =
    useFetchFeaturedChatbots({
      enabled: auth.isAuthenticated && !isSearchActive,
    })

  // Set page-specific dark background on body (darker than global --illinois-blue)
  useEffect(() => {
    const updateBg = () => {
      const isDark = document.documentElement.classList.contains('dark')
      document.body.style.backgroundColor = isDark ? '#081735' : ''
    }
    updateBg()
    const obs = new MutationObserver(updateBg)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => {
      obs.disconnect()
      document.body.style.backgroundColor = ''
    }
  }, [])

  // Public Bots stays on the featured sample; Course and Department bots have their own sections.
  const publicBots = useMemo(
    () =>
      (featuredChatbots ?? [])
        .filter(
          (bot) =>
            !bot.userRole &&
            bot.accessLevel === 'public' &&
            (PROJECT_TYPE_TO_SECTION[bot.projectType as ChatbotProjectType] ??
              DEFAULT_ACCESSIBLE_SECTION) === DEFAULT_ACCESSIBLE_SECTION,
        )
        .sort((a, b) =>
          compareChatbotTagPrecedence(cardSortTags(a), cardSortTags(b)),
        ),
    [featuredChatbots],
  )

  if (auth.isLoading) {
    return (
      <MainPageBackground>
        <LoadingSpinner />
      </MainPageBackground>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <PermissionGate
        course_name={course_name ? (course_name as string) : 'new'}
      />
    )
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#081735]">
      <ChatbotsGlobalNav hideBorder />
      <div className="mx-auto w-full pt-[72px]">
        {/* Search & Filter Bar — sticky just below the global nav */}
        <div className="border-border sticky top-[72px] z-30 space-y-4 border-b bg-white px-4 py-6 sm:px-8 dark:border-[#32517a] dark:bg-[#081735]">
          <ChatbotsSearchBar
            params={searchParams}
            onParamsChange={handleParamsChange}
            isFiltersOpen={isFiltersOpen}
            onToggleFilters={handleToggleFilters}
          />
          <ChatbotsFilterPanel
            params={searchParams}
            onParamsChange={handleParamsChange}
            open={isFiltersOpen}
          />
        </div>

        <ChatbotsHeroSection />

        <div className="pb-12 dark:bg-[#081735]">
          {isSearchActive ? (
            <div className="px-4 sm:px-8">
              <ChatbotsSearchResults
                results={searchData?.results ?? []}
                total={searchData?.total ?? 0}
                isLoading={isSearchLoading}
                isError={isSearchError}
              />
            </div>
          ) : (
            <>
              {PAGED_SECTIONS.map(({ title, source }) => (
                <ChatbotsSection
                  key={title}
                  title={title}
                  source={source}
                  empty={source === 'yours' ? createFirstChatbot : undefined}
                />
              ))}
              {isFeaturedLoading ? (
                <div className="flex justify-center py-20">
                  <LoadingSpinner />
                </div>
              ) : (
                publicBots.length > 0 && (
                  <ChatbotsSection
                    title={DEFAULT_ACCESSIBLE_SECTION}
                    cards={publicBots}
                  />
                )
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default ChatbotsHubPage
