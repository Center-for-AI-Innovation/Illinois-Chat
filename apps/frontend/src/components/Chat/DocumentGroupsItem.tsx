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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { IconSearch } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useContext, useMemo, useState } from 'react'
import HomeContext from '~/components/home/home.context'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'

export const DocumentGroupsItem = ({}) => {
  const {
    state: { documentGroups },
    dispatch: homeDispatch,
  } = useContext(HomeContext)

  const isSmallScreen = useMediaQuery('(max-width: 960px)')
  const [documentGroupSearch, setDocumentGroupSearch] = useState('')

  // Logic to filter doc_groups based on the search query
  const filteredDocumentGroups = useMemo(() => {
    if (!documentGroups) {
      return []
    }

    return [...documentGroups].filter((doc_group_obj) =>
      doc_group_obj.name
        ?.toLowerCase()
        .includes(documentGroupSearch?.toLowerCase()),
    )
  }, [documentGroups, documentGroupSearch])

  // Handle doc_group search change
  const handleDocumentGroupSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setDocumentGroupSearch(event.target.value)
  }

  const handleToggleChecked = (id: string) => {
    const target = documentGroups.find((docGroup) => docGroup.id === id)
    if (target?.adminDisabled) {
      return
    }
    homeDispatch({
      field: 'documentGroups',
      value: documentGroups.map((docGroup) =>
        docGroup.id === id
          ? { ...docGroup, checked: !docGroup.checked }
          : docGroup,
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
              className={`heading-h5 px-4 pt-4 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4`}
            >
              Document Groups
            </h5>
          ) : (
            <h3
              className={`heading-h3 px-4 pt-4 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4`}
            >
              Document Groups
            </h3>
          )}
          <div className="flex flex-col items-center justify-center rounded-lg">
            <div className="relative my-3 w-[90%]">
              <IconSearch
                size={isSmallScreen ? 15 : 20}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--foreground-faded)"
              />
              <Input
                type="search"
                placeholder="Search by Document Group"
                aria-label="Search by Document Group"
                value={documentGroupSearch}
                onChange={handleDocumentGroupSearchChange}
                className={`rounded-lg border-(--background-dark) bg-(--background-faded) pl-9 text-(--foreground) focus-visible:border-(--background-darker) ${
                  isSmallScreen ? 'h-7 text-xs' : 'h-8 text-sm'
                }`}
              />
            </div>

            <Table
              aria-label="Document groups configuration"
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
                    Document Group
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
                {filteredDocumentGroups.map((doc_group_obj, index) => (
                  <TableRow
                    key={doc_group_obj.id ?? index}
                    className={
                      doc_group_obj.adminDisabled ? 'opacity-[0.72]' : undefined
                    }
                  >
                    <TableCell style={{ wordWrap: 'break-word' }}>
                      <span
                        className={`${
                          montserrat_paragraph.variable
                        } font-montserratParagraph ${
                          isSmallScreen ? 'text-xs' : 'text-sm'
                        }`}
                      >
                        {doc_group_obj.name}
                      </span>
                    </TableCell>
                    <TableCell
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        wordWrap: 'break-word',
                      }}
                    >
                      {doc_group_obj.adminDisabled ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={<span style={{ display: 'inline-flex' }} />}
                          >
                            <Switch
                              checked={doc_group_obj.checked}
                              disabled={doc_group_obj.adminDisabled}
                              aria-label={`${doc_group_obj.name}: Admin has disabled that doc group`}
                              onCheckedChange={() =>
                                handleToggleChecked(doc_group_obj.id)
                              }
                              size="sm"
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            Admin has disabled that doc group
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span
                          style={{ display: 'inline-flex' }}
                          className="cursor-pointer"
                        >
                          <Switch
                            checked={doc_group_obj.checked}
                            aria-label={`${doc_group_obj.name}: toggle document group`}
                            onCheckedChange={() =>
                              handleToggleChecked(doc_group_obj.id)
                            }
                            size="sm"
                            className={
                              doc_group_obj.checked
                                ? 'data-checked:border-(--dashboard-button) data-checked:bg-(--dashboard-button)'
                                : 'data-unchecked:border-(--dashboard-background-dark) data-unchecked:bg-(--dashboard-background-dark)'
                            }
                          />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDocumentGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <span className="block text-center">
                        No document groups found
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
