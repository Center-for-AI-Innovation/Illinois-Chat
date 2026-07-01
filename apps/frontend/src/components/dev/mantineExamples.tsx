/* eslint-disable @typescript-eslint/no-empty-function */
import React, { useState, type ReactNode } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  CopyButton,
  Divider,
  HoverCard,
  Indicator,
  List,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'

function MantineModalDemo() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <Button onClick={() => setOpened(true)}>Open Modal</Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Modal Title"
        centered
      >
        <p>Modal content goes here</p>
      </Modal>
    </>
  )
}

export const mantineExamples: Record<string, () => ReactNode> = {
  Button: () => (
    <>
      <Button variant="filled" size="md">
        Filled Button
      </Button>
      <Button variant="outline" size="md">
        Outline
      </Button>
      <Button variant="subtle" size="sm" color="blue">
        Subtle
      </Button>
    </>
  ),
  ActionIcon: () => (
    <>
      <ActionIcon variant="filled" size="lg" color="blue">
        O
      </ActionIcon>
      <ActionIcon variant="subtle" size="md" color="gray">
        X
      </ActionIcon>
      <ActionIcon variant="outline" size="sm" disabled>
        -
      </ActionIcon>
    </>
  ),
  Text: () => (
    <>
      <Text size="md" weight={400} color="black">
        Regular text
      </Text>
      <Text size="sm" color="dimmed" italic>
        Dimmed italic
      </Text>
      <Text size="lg" weight={600} underline>
        Bold underlined
      </Text>
    </>
  ),
  Title: () => (
    <>
      <Title order={1} size="h1">
        Heading 1
      </Title>
      <Title order={2} size="h2" color="blue">
        Heading 2
      </Title>
      <Title order={3} size="h3" weight={600}>
        Heading 3
      </Title>
    </>
  ),
  Divider: () => (
    <>
      <Divider orientation="horizontal" size="md" />
      <Divider orientation="vertical" color="blue" variant="dashed" />
      <Divider label="OR" labelPosition="center" />
    </>
  ),
  Badge: () => (
    <>
      <Badge variant="filled" color="blue" size="lg">
        Filled
      </Badge>
      <Badge variant="outline" color="gray" size="md">
        Outline
      </Badge>
      <Badge variant="light" color="red" size="sm">
        Light
      </Badge>
    </>
  ),
  TextInput: () => (
    <>
      <TextInput label="Email" placeholder="your@email.com" variant="filled" />
      <TextInput
        label="Username"
        placeholder="enter username"
        variant="outline"
        size="lg"
      />
    </>
  ),
  Textarea: () => (
    <>
      <Textarea
        label="Comments"
        placeholder="Your feedback"
        variant="filled"
        minRows={3}
      />
      <Textarea
        label="Description"
        placeholder="Enter details"
        variant="outline"
        autoFocus
      />
    </>
  ),
  Select: () => (
    <>
      <Select
        label="Choose option"
        placeholder="Pick one"
        data={['React', 'Angular', 'Vue']}
        variant="filled"
      />
      <Select
        label="Status"
        data={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        variant="outline"
      />
    </>
  ),
  Checkbox: () => (
    <>
      <Checkbox label="I agree" />
      <Checkbox label="Subscribe" size="lg" variant="outline" />
      <Checkbox label="Disabled" disabled />
    </>
  ),
  Switch: () => (
    <>
      <Switch label="Enable notifications" />
      <Switch label="Dark mode" size="lg" onLabel="ON" offLabel="OFF" />
      <Switch label="Accept terms" disabled />
    </>
  ),
  Slider: () => (
    <Slider
      label="Volume"
      defaultValue={50}
      min={0}
      max={100}
      step={1}
      className="w-64"
    />
  ),
  MultiSelect: () => (
    <>
      <MultiSelect
        label="Select tags"
        placeholder="Pick multiple"
        data={[
          { value: 'react', label: 'React' },
          { value: 'vue', label: 'Vue' },
        ]}
        defaultValue={['react']}
        searchable
        clearable
      />
    </>
  ),
  SegmentedControl: () => (
    <>
      <SegmentedControl
        value="option1"
        onChange={() => {}}
        data={[
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' },
          { value: 'option3', label: 'Option 3' },
        ]}
        size="md"
        color="blue"
      />
    </>
  ),
  Modal: () => <MantineModalDemo />,
  Tooltip: () => (
    <>
      <Tooltip label="Tooltip content" position="top" offset={5} withArrow>
        <button>Hover me</button>
      </Tooltip>
    </>
  ),
  Menu: () => (
    <>
      <Menu>
        <Menu.Target>
          <button>Menu</button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item>Item 1</Menu.Item>
          <Menu.Item>Item 2</Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red">Delete</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  ),
  HoverCard: () => (
    <>
      <HoverCard>
        <HoverCard.Target>
          <a href="#">Username</a>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <p>User profile info goes here</p>
        </HoverCard.Dropdown>
      </HoverCard>
    </>
  ),
  Card: () => (
    <>
      <Card shadow="md" padding="lg" radius="md">
        <Card.Section>Header content</Card.Section>
        <p>Card body</p>
      </Card>
      <Card variant="light" p="md">
        Minimal card
      </Card>
    </>
  ),
  Paper: () => (
    <>
      <Paper shadow="md" p="md" radius="lg">
        Paper with shadow
      </Paper>
      <Paper withBorder radius="sm">
        Paper with border
      </Paper>
    </>
  ),
  Table: () => (
    <Table striped highlightOnHover withBorder fontSize="sm">
      <thead>
        <tr>
          <th>Column</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Row 1</td>
          <td>Value</td>
        </tr>
      </tbody>
    </Table>
  ),
  Avatar: () => (
    <>
      <Avatar src="/avatar.jpg" alt="User" size="lg" />
      <Avatar size="md" radius="xl" color="blue" variant="light">
        JD
      </Avatar>
      <Avatar.Group spacing="lg">
        <Avatar src="/a1.jpg" />
        <Avatar src="/a2.jpg" />
      </Avatar.Group>
    </>
  ),
  Indicator: () => (
    <>
      <Indicator color="red" position="top-end" size="lg">
        <Avatar src="/avatar.jpg" />
      </Indicator>
      <Indicator label="5" position="bottom-end" color="blue">
        <div className="h-8 w-8 bg-gray-300" />
      </Indicator>
    </>
  ),
  Progress: () => (
    <>
      <Progress value={65} color="blue" size="lg" radius="md" />
      <Progress value={50} striped animate color="green" />
      <Progress
        sections={[
          { value: 20, color: 'red' },
          { value: 30, color: 'orange' },
        ]}
      />
    </>
  ),
  List: () => (
    <>
      <List type="unordered" spacing="sm" size="sm">
        <List.Item>First item</List.Item>
        <List.Item>Second item</List.Item>
      </List>
      <List type="ordered" withPadding icon={<span>•</span>}>
        <List.Item>Numbered</List.Item>
      </List>
    </>
  ),
  Tabs: () => (
    <>
      <Tabs defaultValue="tab1">
        <Tabs.List>
          <Tabs.Tab value="tab1">Tab 1</Tabs.Tab>
          <Tabs.Tab value="tab2">Tab 2</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
        <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
      </Tabs>
    </>
  ),
  Accordion: () => (
    <>
      <Accordion>
        <Accordion.Item value="item1">
          <Accordion.Control>Section 1</Accordion.Control>
          <Accordion.Panel>Content 1</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="item2">
          <Accordion.Control>Section 2</Accordion.Control>
          <Accordion.Panel>Content 2</Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  ),
  Collapse: () => (
    <>
      <p className="text-xs text-gray-500">(shown open)</p>
      <Collapse in={true}>Collapse content</Collapse>
    </>
  ),
  Alert: () => (
    <>
      <Alert title="Info" variant="light" color="blue" withCloseButton>
        This is an alert message
      </Alert>
      <Alert title="Error" variant="filled" color="red">
        Error alert content
      </Alert>
    </>
  ),
  ScrollArea: () => (
    <>
      <ScrollArea style={{ width: 300, height: 200 }} type="auto">
        <div style={{ padding: 16 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i}>Item {i + 1}</div>
          ))}
        </div>
      </ScrollArea>
    </>
  ),
  Notifications: () => (
    <button
      className="rounded border px-3 py-1 text-sm"
      onClick={() =>
        notifications.show({
          title: 'Success',
          message: 'Action completed',
          color: 'green',
        })
      }
    >
      Show notification
    </button>
  ),
  CopyButton: () => (
    <>
      <CopyButton value="Text to copy">
        {({ copied, copy }) => (
          <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        )}
      </CopyButton>
    </>
  ),
}
