import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Head from 'next/head'
import { Button } from '@/components/shadcn/ui/button'
import { Calendar } from '@/components/shadcn/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/shadcn/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select'
import type { DateRange } from 'react-day-picker'
import {
  IconCalendar,
  IconChartBar,
  IconCloudDownload,
  IconMessage2,
  IconMessageCircle2,
  IconMinus,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { GRID_CONFIGS, useResponsiveGrid } from '~/utils/responsiveGrid'
import { downloadConversationHistory } from '~/utils/downloadConversationHistory'
import { getProjectStats } from '../../pages/api/UIUC-api/getProjectStats'
import ConversationsHeatmapByHourChart from './ConversationsHeatmapByHourChart'
import ConversationsPerDayChart from './ConversationsPerDayChart'
import ConversationsPerDayOfWeekChart from './ConversationsPerDayOfWeekChart'
import ConversationsPerHourChart from './ConversationsPerHourChart'
import { LoadingSpinner } from './LoadingSpinner'
import ModelUsageChart from './ModelUsageChart'

const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
]

const VIEW_OPTIONS = [
  { value: 'hour', label: 'By Hour' },
  { value: 'weekday', label: 'By Day of Week' },
]

const formatDateRangeLabel = (dateRange: [Date | null, Date | null]) => {
  const [from, to] = dateRange
  if (!from) return 'Pick date range'
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return to ? `${fmt(from)} – ${fmt(to)}` : fmt(from)
}

import { useAuth } from 'react-oidc-context'

export const GetCurrentPageName = () => {
  // /CS-125/dashboard --> CS-125
  return useRouter().asPath.slice(1).split('/')[0] as string
}

interface ModelUsage {
  model_name: string
  count: number
  percentage: number
}

interface ConversationStats {
  per_day: { [date: string]: number }
  per_hour: { [hour: string]: number }
  per_weekday: { [day: string]: number }
  heatmap: { [day: string]: { [hour: string]: number } }
}

interface CourseStats {
  total_conversations: number
  total_users: number
  total_messages: number
  avg_conversations_per_user: number
  avg_messages_per_user: number
  avg_messages_per_conversation: number
}

interface WeeklyTrend {
  current_week_value: number
  metric_name: string
  percentage_change: number
  previous_week_value: number
}

const formatPercentageChange = (value: number | null | undefined) => {
  if (value == null) return '0'
  return value.toFixed(1)
}

const MakeQueryAnalysisPage = ({ course_name }: { course_name: string }) => {
  const auth = useAuth()
  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [currentEmail, setCurrentEmail] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const router = useRouter()

  // Get responsive grid classes based on sidebar state
  const statsGridClasses = useResponsiveGrid(
    GRID_CONFIGS.STATS_CARDS,
    sidebarCollapsed,
  )
  const chartsGridClasses = useResponsiveGrid(
    GRID_CONFIGS.CHARTS,
    sidebarCollapsed,
  )

  const currentPageName = GetCurrentPageName()

  const [isLoading, setIsLoading] = useState(false)

  const [conversationStats, setConversationStats] =
    useState<ConversationStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [courseStatsLoading, setCourseStatsLoading] = useState(true)
  const [courseStats, setCourseStats] = useState<CourseStats | null>(null)
  const [courseStatsError, setCourseStatsError] = useState<string | null>(null)

  // Update the state to use an array of WeeklyTrend
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrend[]>([])
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [trendsError, setTrendsError] = useState<string | null>(null)

  const [modelUsageData, setModelUsageData] = useState<ModelUsage[]>([])
  const [modelUsageLoading, setModelUsageLoading] = useState(true)
  const [modelUsageError, setModelUsageError] = useState<string | null>(null)

  const [dateRangeType, setDateRangeType] = useState<string>('last_month')
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ])
  const [isDateRangePopoverOpen, setIsDateRangePopoverOpen] = useState(false)
  const [totalCount, setTotalCount] = useState<number>(0)

  // Separate state for filtered conversation stats
  const [filteredConversationStats, setFilteredConversationStats] =
    useState<ConversationStats | null>(null)
  const [filteredStatsLoading, setFilteredStatsLoading] = useState(true)
  const [filteredStatsError, setFilteredStatsError] = useState<string | null>(
    null,
  )

  // TODO: remove this hook... we should already have this from the /materials props???
  useEffect(() => {
    const fetchData = async () => {
      setCurrentEmail(auth.user?.profile.email as string)

      try {
        const metadata: CourseMetadata = (await fetchCourseMetadata(
          currentPageName,
        )) as CourseMetadata

        if (metadata && metadata.is_private) {
          metadata.is_private = JSON.parse(
            metadata.is_private as unknown as string,
          )
        }
        setCourseMetadata(metadata)
      } catch (error) {
        console.error(error)
      }
    }

    fetchData()
  }, [currentPageName, !auth.isLoading, auth.user])

  const [hasConversationData, setHasConversationData] = useState<boolean>(true)

  const getDateRange = () => {
    const today = new Date()
    switch (dateRangeType) {
      case 'last_week':
        const lastWeek = new Date(today)
        lastWeek.setDate(today.getDate() - 7)
        return {
          from_date: lastWeek.toISOString().split('T')[0],
          to_date: today.toISOString().split('T')[0],
        }
      case 'last_month':
        const lastMonth = new Date(today)
        lastMonth.setMonth(today.getMonth() - 1)
        return {
          from_date: lastMonth.toISOString().split('T')[0],
          to_date: today.toISOString().split('T')[0],
        }
      case 'last_year':
        const lastYear = new Date(today)
        lastYear.setFullYear(today.getFullYear() - 1)
        return {
          from_date: lastYear.toISOString().split('T')[0],
          to_date: today.toISOString().split('T')[0],
        }
      case 'custom':
        return {
          from_date: dateRange[0]
            ? dateRange[0].toISOString().split('T')[0]
            : undefined,
          to_date: dateRange[1]
            ? dateRange[1].toISOString().split('T')[0]
            : undefined,
        }
      default:
        return { from_date: undefined, to_date: undefined }
    }
  }

  useEffect(() => {
    const fetchFilteredConversationStats = async () => {
      try {
        const { from_date, to_date } = getDateRange()

        if (dateRangeType === 'custom' && (!dateRange[0] || !dateRange[1])) {
          setHasConversationData(false)
          return
        }

        // TODO: Change this to a fetch request
        const response = await fetch('/api/UIUC-api/getConversationStats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_name, from_date, to_date }),
        })
        if (response.status === 200) {
          const data = await response.json()
          setFilteredConversationStats(data)
          setTotalCount(data.total_count || 0)
          setHasConversationData(Object.keys(data.per_day).length > 0)
        }
      } catch (error) {
        console.error('Error fetching filtered conversation stats:', error)
        setFilteredStatsError('Failed to fetch conversation statistics')
        setHasConversationData(false)
      } finally {
        setFilteredStatsLoading(false)
      }
    }

    fetchFilteredConversationStats()
  }, [course_name, dateRangeType, dateRange])

  useEffect(() => {
    const fetchAllTimeConversationStats = async () => {
      try {
        const response = await fetch('/api/UIUC-api/getConversationStats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_name }),
        })
        if (response.status === 200) {
          const data = await response.json()
          setConversationStats(data)
        }
      } catch (error) {
        console.error('Error fetching all-time conversation stats:', error)
        setStatsError('Failed to fetch conversation statistics')
      } finally {
        setStatsLoading(false)
      }
    }

    fetchAllTimeConversationStats()
  }, [course_name])

  useEffect(() => {
    const fetchCourseStats = async () => {
      setCourseStatsLoading(true)
      setCourseStatsError(null)
      try {
        const response = await fetch('/api/UIUC-api/getProjectStats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_name, project_name: course_name }),
        })
        if (response.status === 200) {
          const data = await response.json()
          const mappedData = {
            total_conversations: data.total_conversations,
            total_messages: data.total_messages,
            total_users: data.unique_users,
            avg_conversations_per_user: data.avg_conversations_per_user,
            avg_messages_per_user: data.avg_messages_per_user,
            avg_messages_per_conversation: data.avg_messages_per_conversation,
          }
          setCourseStats(mappedData)
        } else {
          throw new Error('Failed to fetch course stats')
        }
      } catch (error) {
        setCourseStatsError('Failed to load stats')
      } finally {
        setCourseStatsLoading(false)
      }
    }

    fetchCourseStats()
  }, [course_name])

  useEffect(() => {
    const fetchWeeklyTrends = async () => {
      setTrendsLoading(true)
      setTrendsError(null)
      try {
        const response = await fetch('/api/UIUC-api/getWeeklyTrends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_name, project_name: course_name }),
        })
        if (response.status === 200) {
          const data = await response.json()
          setWeeklyTrends(data)
        } else {
          throw new Error('Failed to fetch weekly trends')
        }
      } catch (error) {
        setTrendsError('Failed to load trends')
      } finally {
        setTrendsLoading(false)
      }
    }

    fetchWeeklyTrends()
  }, [course_name])

  useEffect(() => {
    const fetchModelUsage = async () => {
      setModelUsageLoading(true)
      setModelUsageError(null)
      try {
        const response = await fetch('/api/UIUC-api/getModelUsageCounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_name, project_name: course_name }),
        })
        if (response.status === 200) {
          const data = await response.json()
          setModelUsageData(data)
        } else {
          throw new Error('Failed to fetch model usage data')
        }
      } catch (error) {
        setModelUsageError('Failed to load model usage data')
      } finally {
        setModelUsageLoading(false)
      }
    }

    fetchModelUsage()
  }, [course_name])

  const [view, setView] = useState('hour')

  if (auth.isLoading || !courseMetadata) {
    return <LoadingSpinner />
  }

  if (
    courseMetadata &&
    currentEmail !== (courseMetadata.course_owner as string) &&
    courseMetadata.course_admins.indexOf(currentEmail) === -1
  ) {
    router.replace(`/${course_name}/not_authorized`)

    return (
      <CannotEditCourse
        course_name={currentPageName as string}
        // current_email={currentEmail as string}
      />
    )
  }

  const handleDownload = async (courseName: string) => {
    setIsLoading(true)
    try {
      const result = await downloadConversationHistory(courseName)
      showToastOnUpdate(false, false, result.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <SettingsLayout
        course_name={course_name}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      >
        <Head>
          <title>{course_name} — Analytics — Illinois Chat</title>
          <meta
            name="description"
            content="The AI teaching assistant built for students at UIUC."
          />
          <link rel="icon" href="/favicon.ico" />
          {/* <Header /> */}
        </Head>
        <main
          id="main-content"
          tabIndex={-1}
          className="course-page-main flex min-h-screen w-full flex-col items-center"
        >
          <h1 className="sr-only">{course_name} Analytics</h1>
          <div className="items-left flex w-full flex-col justify-center py-0">
            <div className="flex w-full flex-col items-center">
              <div className="pt-5"></div>
              <div className="flex w-[96%] flex-col items-center rounded-3xl bg-(--background) pt-4 md:w-full 2xl:w-[95%]">
                <div className="flex w-[95%] items-center justify-between pb-4">
                  <h3
                    className={`heading-h3 grow-[2] px-4 text-left text-(--dashboard-foreground) ${montserrat_heading.variable} font-montserratHeading`}
                  >
                    Usage Overview
                  </h3>
                  <Button
                    type="button"
                    variant="dashboard"
                    className={`${montserrat_paragraph.variable} font-montserratParagraph h-12 w-full items-center justify-center gap-2.5 rounded-2xl px-2 text-sm transition-colors sm:w-auto sm:px-4 sm:text-base`}
                    onClick={() => handleDownload(course_name)}
                  >
                    <span className="hidden sm:inline">
                      Download Conversation History
                    </span>
                    <span className="sm:hidden">Download History</span>
                    {isLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <IconCloudDownload
                        className="hidden sm:block"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                </div>

                {/* Project Analytics Dashboard - Using all-time stats */}
                <div className="my-6 w-[95%] rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground)">
                  <div className="mb-6">
                    <h4
                      className={`heading-h4 ${montserrat_heading.variable} font-montserratHeading`}
                    >
                      Project Analytics
                    </h4>
                    <p className="mt-0.5 text-sm text-(--dashboard-foreground-faded)">
                      Overview of project engagement and usage statistics
                    </p>
                  </div>

                  {/* Main Stats Grid with Integrated Weekly Trends */}
                  <div className={`grid gap-6 ${statsGridClasses}`}>
                    {/* Conversations Card */}
                    <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="mb-px text-sm font-medium">
                            Total Conversations
                          </p>
                          <p className="text-xs text-(--foreground-faded)">
                            All-time chat sessions
                          </p>
                        </div>
                        <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                          <IconMessageCircle2
                            size={24}
                            className="text-(--dashboard-stat)"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center gap-3">
                          <p className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.total_conversations?.toLocaleString() ||
                              '0'}
                          </p>

                          {(() => {
                            const trend = weeklyTrends.find(
                              (t) => t.metric_name === 'Total Conversations',
                            )
                            if (!trend) return null

                            return (
                              <div
                                className={`flex items-center gap-2 rounded-md ${
                                  trend.percentage_change > 0
                                    ? 'bg-green-400/10'
                                    : trend.percentage_change < 0
                                      ? 'bg-red-400/10'
                                      : 'bg-gray-400/10'
                                }`}
                              >
                                {trend.percentage_change > 0 ? (
                                  <IconTrendingUp
                                    size={32}
                                    className="text-green-400"
                                    aria-hidden="true"
                                  />
                                ) : trend.percentage_change < 0 ? (
                                  <IconTrendingDown
                                    size={32}
                                    className="text-red-400"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <IconMinus
                                    size={18}
                                    className="text-gray-400"
                                    aria-hidden="true"
                                  />
                                )}
                                <p
                                  className={`text-sm font-medium ${
                                    trend.percentage_change > 0
                                      ? 'text-green-400'
                                      : trend.percentage_change < 0
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}
                                >
                                  {trend.percentage_change > 0 ? '+' : ''}
                                  {formatPercentageChange(
                                    trend.percentage_change,
                                  )}
                                  % vs last week
                                </p>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Users Card */}
                    <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="mb-px text-sm font-medium">
                            Total Users
                          </p>
                          <p className="text-xs text-(--foreground-faded)">
                            All-time unique participants
                          </p>
                        </div>
                        <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                          <IconUsers
                            size={24}
                            className="text-(--dashboard-stat)"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center gap-3">
                          <p className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.total_users?.toLocaleString() || '0'}
                          </p>
                          {(() => {
                            const trend = weeklyTrends.find(
                              (t) => t.metric_name === 'Unique Users',
                            )
                            if (!trend) return null

                            return (
                              <div
                                className={`flex items-center gap-2 rounded-md ${
                                  trend.percentage_change > 0
                                    ? 'bg-green-400/10'
                                    : trend.percentage_change < 0
                                      ? 'bg-red-400/10'
                                      : 'bg-gray-400/10'
                                }`}
                              >
                                {trend.percentage_change > 0 ? (
                                  <IconTrendingUp
                                    size={32}
                                    className="text-green-400"
                                    aria-hidden="true"
                                  />
                                ) : trend.percentage_change < 0 ? (
                                  <IconTrendingDown
                                    size={32}
                                    className="text-red-400"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <IconMinus
                                    size={18}
                                    className="text-gray-400"
                                    aria-hidden="true"
                                  />
                                )}
                                <p
                                  className={`text-sm font-medium ${
                                    trend.percentage_change > 0
                                      ? 'text-green-400'
                                      : trend.percentage_change < 0
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}
                                >
                                  {trend.percentage_change > 0 ? '+' : ''}
                                  {formatPercentageChange(
                                    trend.percentage_change,
                                  )}
                                  % vs last week
                                </p>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Messages Card */}
                    <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="mb-px text-sm font-medium">
                            Messages
                          </p>
                          <p className="text-xs text-(--foreground-faded)">
                            Total exchanges
                          </p>
                        </div>
                        <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                          <IconMessage2
                            size={24}
                            className="text-(--dashboard-stat)"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center gap-3">
                          <p className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.total_messages?.toLocaleString() ||
                              '0'}
                          </p>

                          {(() => {
                            const trend = weeklyTrends.find(
                              (t) => t.metric_name === 'Total Messages',
                            )
                            if (!trend) return null

                            return (
                              <div
                                className={`flex items-center gap-2 rounded-md ${
                                  trend.percentage_change > 0
                                    ? 'bg-green-400/10'
                                    : trend.percentage_change < 0
                                      ? 'bg-red-400/10'
                                      : 'bg-gray-400/10'
                                }`}
                              >
                                {trend.percentage_change > 0 ? (
                                  <IconTrendingUp
                                    size={32}
                                    className="text-green-400"
                                    aria-hidden="true"
                                  />
                                ) : trend.percentage_change < 0 ? (
                                  <IconTrendingDown
                                    size={32}
                                    className="text-red-400"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <IconMinus
                                    size={18}
                                    className="text-gray-400"
                                    aria-hidden="true"
                                  />
                                )}
                                <p
                                  className={`text-sm font-medium ${
                                    trend.percentage_change > 0
                                      ? 'text-green-400'
                                      : trend.percentage_change < 0
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}
                                >
                                  {trend.percentage_change > 0 ? '+' : ''}
                                  {formatPercentageChange(
                                    trend.percentage_change,
                                  )}
                                  % vs last week
                                </p>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* User Engagement Metrics Section */}
                  <div className="mt-8">
                    <div className="mb-4 flex items-center">
                      <div className="flex-1">
                        <p
                          className={`text-lg font-semibold ${montserrat_heading.variable} font-montserratHeading`}
                        >
                          User Engagement Metrics
                        </p>
                        <p className="mt-px text-sm text-(--dashboard-foreground-faded)">
                          Detailed breakdown of user interaction patterns
                        </p>
                      </div>
                    </div>

                    <div className={`grid gap-6 ${statsGridClasses}`}>
                      {/* Average Conversations per User */}
                      <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="mb-px text-sm font-medium">
                              Conversations per User
                            </p>
                            <p className="text-xs text-(--foreground-faded)">
                              Average engagement frequency
                            </p>
                          </div>
                          <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                            <IconMessageCircle2
                              size={24}
                              className="text-(--dashboard-stat)"
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                          <p className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.avg_conversations_per_user?.toFixed(
                              1,
                            ) || '0'}
                          </p>
                          <p className="text-sm text-(--foreground-faded)">
                            conversations / user
                          </p>
                        </div>
                      </div>

                      {/* Average Messages per User */}
                      <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="mb-px text-sm font-medium">
                              Messages per User
                            </p>
                            <p className="text-xs text-(--foreground-faded)">
                              Average interaction depth
                            </p>
                          </div>
                          <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                            <IconMessage2
                              size={24}
                              className="text-(--dashboard-stat)"
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                          <p className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.avg_messages_per_user?.toFixed(1) ||
                              '0'}
                          </p>
                          <p className="text-sm text-(--foreground-faded)">
                            messages / user
                          </p>
                        </div>
                      </div>

                      {/* Average Messages per Conversation */}
                      <div className="rounded-lg bg-(--dashboard-background) p-4 text-(--dashboard-foreground) transition-all duration-200">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="mb-px text-sm font-medium">
                              Messages per Conversation
                            </p>
                            <p className="text-xs text-(--foreground-faded)">
                              Average conversation length
                            </p>
                          </div>
                          <div className="rounded-full bg-(--dashboard-background-dark) p-2">
                            <IconChartBar
                              size={24}
                              className="text-(--dashboard-stat)"
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                          <p className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-(--dashboard-stat) text-xl font-bold text-white">
                            {courseStats?.avg_messages_per_conversation?.toFixed(
                              1,
                            ) || '0'}
                          </p>
                          <p className="text-sm text-(--foreground-faded)">
                            messages / conversation
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts Section - Using filtered stats */}
                <div className="grid w-[95%] grid-cols-1 gap-6 pb-10 lg:grid-cols-2">
                  {/* Date Range Selector - Always visible */}
                  <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200 lg:col-span-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="heading-h4">Conversation Visualizations</h4>
                        <p className="mt-px text-sm">
                          Select a time range to filter the visualizations below
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Select
                          value={dateRangeType}
                          onValueChange={(value) => {
                            setDateRangeType(value || 'all')
                            if (value !== 'custom') {
                              setDateRange([null, null])
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label="Date range filter"
                            className={`w-[200px] border-(--background-dark) bg-(--background) text-(--foreground) focus-visible:border-(--dashboard-button) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            <SelectValue placeholder="Select a range">
                              {(value: string | null) =>
                                DATE_RANGE_OPTIONS.find(
                                  (option) => option.value === value,
                                )?.label ?? 'Select a range'
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="border-(--background-dark) bg-(--background) text-(--foreground)">
                            {DATE_RANGE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                className="data-highlighted:bg-(--foreground-faded)"
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dateRangeType === 'custom' && (
                          <Popover
                            open={isDateRangePopoverOpen}
                            onOpenChange={setIsDateRangePopoverOpen}
                          >
                            <PopoverTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="outline"
                                  aria-label="Custom date range picker"
                                  className={`w-[200px] justify-start gap-2 border-(--foreground-faded) bg-(--background) text-sm text-(--foreground) hover:border-(--dashboard-button) ${montserrat_paragraph.variable} font-montserratParagraph`}
                                />
                              }
                            >
                              <IconCalendar
                                size="1.1rem"
                                stroke={1.5}
                                aria-hidden="true"
                                className="text-(--foreground)"
                              />
                              {formatDateRangeLabel(dateRange)}
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-auto border-(--background-dark) bg-(--background) p-0 text-(--foreground)"
                            >
                              <Calendar
                                mode="range"
                                selected={{
                                  from: dateRange[0] ?? undefined,
                                  to: dateRange[1] ?? undefined,
                                }}
                                onSelect={(range: DateRange | undefined) => {
                                  setDateRange([
                                    range?.from ?? null,
                                    range?.to ?? null,
                                  ])
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        {totalCount > 0 && (
                          <p className="text-sm text-(--foreground-faded)">
                            {totalCount} conversations in selected range
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {!hasConversationData ? (
                    <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200">
                      <h4
                        className={`heading-h4 ${montserrat_heading.variable} font-montserratHeading`}
                      >
                        No conversation data available for selected time range
                      </h4>
                      <p className="mt-4 text-lg">
                        Try selecting a different time range to view the
                        visualizations
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Model Usage Chart */}
                      <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200">
                        <h4 className="heading-h4 mb-4 text-left">
                          Model Usage Distribution
                        </h4>
                        <p className="mb-8 text-sm">
                          Distribution of AI models used across all
                          conversations
                        </p>
                        <ModelUsageChart
                          data={modelUsageData}
                          isLoading={modelUsageLoading}
                          error={modelUsageError}
                        />
                      </div>

                      {/* Conversations Per Day Chart */}
                      <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200">
                        <h4 className="heading-h4 mb-4 text-left">
                          Conversations Per Day
                        </h4>
                        <p className="mb-8 text-sm">
                          Shows the total number of conversations that occurred
                          on each calendar day
                        </p>
                        <ConversationsPerDayChart
                          data={filteredConversationStats?.per_day}
                          isLoading={filteredStatsLoading}
                          error={filteredStatsError}
                        />
                      </div>

                      {/* Combined Hour/Weekday Chart */}
                      <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <h4 className="heading-h4">
                              Aggregated Conversation Breakdown
                            </h4>
                            <p className="mt-px text-sm">
                              View conversation patterns by hour of day or day
                              of week
                            </p>
                          </div>
                          <Select
                            value={view}
                            onValueChange={(value) => setView(value || 'hour')}
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label="View by hour or day"
                              className={`w-[150px] border-(--background-dark) bg-(--background) text-xs text-(--foreground) focus-visible:border-(--dashboard-button) ${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              <SelectValue placeholder="Select a view">
                                {(value: string | null) =>
                                  VIEW_OPTIONS.find(
                                    (option) => option.value === value,
                                  )?.label ?? 'Select a view'
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="border-(--background-dark) bg-(--background) text-(--foreground)">
                              {VIEW_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  className="data-highlighted:bg-(--foreground-faded)"
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {view === 'hour' ? (
                          <ConversationsPerHourChart
                            data={filteredConversationStats?.per_hour}
                            isLoading={filteredStatsLoading}
                            error={filteredStatsError}
                          />
                        ) : (
                          <ConversationsPerDayOfWeekChart
                            data={filteredConversationStats?.per_weekday}
                            isLoading={filteredStatsLoading}
                            error={filteredStatsError}
                          />
                        )}
                      </div>

                      {/* Heatmap Chart */}
                      <div className="rounded-xl bg-(--dashboard-background-faded) p-6 text-(--dashboard-foreground) transition-all duration-200">
                        <h4 className="heading-h4 mb-4 text-left">
                          Conversations Per Day and Hour
                        </h4>
                        <p className="mb-8 text-sm">
                          A heatmap showing conversation density across both
                          days and hours
                        </p>
                        <ConversationsHeatmapByHourChart
                          data={filteredConversationStats?.heatmap}
                          isLoading={filteredStatsLoading}
                          error={filteredStatsError}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/*<NomicDocumentMap course_name={course_name as string} />*/}
        </main>

        <GlobalFooter />
      </SettingsLayout>
    </>
  )
}

import { type CourseMetadata } from '~/types/courseMetadata'
import { showToast } from '~/utils/toastUtils'
import { CannotEditCourse } from './CannotEditCourse'
import GlobalFooter from './GlobalFooter'

import NomicDocumentMap from './NomicDocumentsMap'

async function fetchCourseMetadata(course_name: string) {
  try {
    const response = await fetch(
      `/api/UIUC-api/getCourseMetadata?course_name=${course_name}`,
    )
    if (response.ok) {
      const data = await response.json()
      if (data.success === false) {
        throw new Error(
          data.message || 'An error occurred while fetching course metadata',
        )
      }
      // Parse is_private field from string to boolean
      if (
        data.course_metadata &&
        typeof data.course_metadata.is_private === 'string'
      ) {
        data.course_metadata.is_private =
          data.course_metadata.is_private.toLowerCase() === 'true'
      }
      return data.course_metadata
    } else {
      throw new Error(
        `Error fetching course metadata: ${
          response.statusText || response.status
        }`,
      )
    }
  } catch (error) {
    console.error('Error fetching course metadata:', error)
    throw error
  }
}

export default MakeQueryAnalysisPage

export const showToastOnUpdate = (
  was_error = false,
  isReset = false,
  message: string,
) => {
  return showToast({
    autoClose: 30000,
    title: message,
    message:
      'Check our docs (https://docs.uiuc.chat/features/bulk-export-documents-or-conversation-history) for example code to process this data.',
    type: 'success',
  })
}
