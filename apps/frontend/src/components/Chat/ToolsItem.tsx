import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import { Input } from '@/components/shadcn/ui/input'
import { Switch } from '@/components/shadcn/ui/switch'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { IconSearch } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useContext, useMemo, useState } from 'react'
import HomeContext from '~/components/home/home.context'

export const ToolsItem = ({}) => {
  const {
    state: { tools },
    dispatch: homeDispatch,
  } = useContext(HomeContext)

  const isSmallScreen = useMediaQuery('(max-width: 960px)')
  const [toolSearch, setToolSearch] = useState('')

  // Logic to filter tools based on the search query
  const filteredTools = useMemo(() => {
    if (!tools) {
      return []
    }

    return [...tools].filter((tool_obj) =>
      tool_obj.readableName?.toLowerCase().includes(toolSearch?.toLowerCase()),
    )
  }, [tools, toolSearch])

  // Handle tool search change
  const handleToolSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setToolSearch(event.target.value)
  }

  const handleToggleChecked = (id: string) => {
    // handleUpdateActions(id)
    homeDispatch({
      field: 'tools',
      value: tools.map((tool) =>
        tool.id === id ? { ...tool, checked: !tool.enabled } : tool,
      ),
    })
  }
  return (
    <>
      <div
        className="flex h-full w-full flex-col space-y-4 rounded-lg p-3"
        style={{ position: 'relative', zIndex: 100 }}
      >
        <div>
          <div className="flex flex-col"></div>
          {isSmallScreen ? (
            <h5
              className={`px-4 pt-4 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4 text-(--modal-text)`}
            >
              Tools
            </h5>
          ) : (
            <h3
              className={`px-4 pt-4 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4 text-(--modal-text)`}
            >
              Tools
            </h3>
          )}
          <div className="flex flex-col items-center justify-center rounded-lg">
            <div className="relative my-2 w-[90%]">
              <IconSearch
                size={isSmallScreen ? 15 : 20}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--foreground-faded)"
              />
              <Input
                type="search"
                placeholder="Search Tools"
                aria-label="Search Tools"
                value={toolSearch}
                onChange={handleToolSearchChange}
                className={`rounded-md border-(--background-dark) bg-(--background-faded) pl-9 text-(--foreground) focus-visible:border-(--background-darker) ${
                  isSmallScreen ? 'h-7 text-xs' : 'h-8 text-sm'
                }`}
              />
            </div>

            {/* unable to use this until v7 of mantine since we can't control the hover color              highlightOnHover */}
            <Table
              aria-label="Tools configuration"
              className="w-[90%] text-(--modal-text)"
            >
              <TableHeader>
                <TableRow
                  className={`${
                    montserrat_paragraph.variable
                  } font-montserratParagraph ${
                    isSmallScreen ? 'text-xs' : 'text-sm'
                  }`}
                >
                  <TableHead
                    style={{
                      width: '60%',
                      wordWrap: 'break-word',
                      color: 'var(--foreground)',
                    }}
                  >
                    Tool
                  </TableHead>
                  <TableHead
                    style={{
                      width: '40%',
                      wordWrap: 'break-word',
                      textAlign: 'center',
                      color: 'var(--foreground)',
                    }}
                  >
                    <span className="flex flex-col items-center justify-center">
                      <span className="self-center">Enabled</span>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:nth-child(even)]:bg-(--background-faded)">
                {filteredTools.map((tool_obj, index) => (
                  <TableRow key={index}>
                    <TableCell style={{ wordWrap: 'break-word' }}>
                      <span
                        className={`${
                          montserrat_paragraph.variable
                        } font-montserratParagraph ${
                          isSmallScreen ? 'text-xs' : 'text-sm'
                        }`}
                      >
                        {tool_obj.readableName}
                      </span>
                    </TableCell>
                    <TableCell
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        wordWrap: 'break-word',
                      }}
                    >
                      <Switch
                        checked={tool_obj.enabled}
                        onCheckedChange={() =>
                          handleToggleChecked(tool_obj.id)
                        }
                        size={isSmallScreen ? 'sm' : 'lg'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <span className="block text-center">
                        No tools found
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  )
}
