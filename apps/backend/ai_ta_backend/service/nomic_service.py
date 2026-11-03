import datetime
import logging
import os
import re
import time

import nomic
import pandas as pd
import numpy as np
from injector import inject
from nomic import AtlasDataset, atlas
from tenacity import retry, stop_after_attempt, wait_exponential

from ai_ta_backend.database.sql import SQLDatabase
from ai_ta_backend.service.sentry_service import SentryService

from ollama import Client

logger = logging.getLogger(__name__)
_init_error_logged = False  # a failed singleton is rebuilt on every request; log the cause once


class NomicService():

  @inject
  def __init__(self, sentry: SentryService, sql: SQLDatabase):
    global _init_error_logged
    log_now = not _init_error_logged
    for dependency, var in (("Nomic", "NOMIC_API_KEY"), ("Ollama", "OLLAMA_SERVER_URL")):
      if log_now and not os.environ.get(var):
        logger.error("%s not configured: %s is unset", dependency, var)
        _init_error_logged = True
    try:
      nomic.cli.login(os.environ['NOMIC_API_KEY'])
    except Exception as e:
      if log_now and not isinstance(e, KeyError):
        logger.error("Nomic login failed: %s", e)
        _init_error_logged = True
      raise
    self.ollama_client = Client(host=os.environ['OLLAMA_SERVER_URL'])
    self.sentry = sentry
    self.sql = sql

  def get_nomic_map(self, course_name: str, type: str):
    """
		Returns the variables necessary to construct an iframe of the Nomic map given a course name.
		We just need the ID and URL.
		Example values:
			map link: https://atlas.nomic.ai/map/ed222613-97d9-46a9-8755-12bbc8a06e3a/f4967ad7-ff37-4098-ad06-7e1e1a93dd93
			map id: f4967ad7-ff37-4098-ad06-7e1e1a93dd93
		"""
    if not course_name or not type:
      raise ValueError("Course name and type are required")
    if type.lower() not in ['document', 'conversation']:
      raise ValueError("Invalid map type")

    start_time = time.monotonic()
    try:
      if type.lower() == 'document':
        field = 'document_map_index'
      else:
        field = 'conversation_map_index'

      map_name = self.sql.getProjectMapName(course_name, field).data[0]
      if not map_name:
        return {"map_id": None, "map_link": None}
      else:
        project_name = map_name[field].split("_index")[0]
        project = AtlasDataset(project_name)
        map = project.get_map(map_name[field])

      logger.debug("Nomic map retrieval course=%s ms=%d", course_name, (time.monotonic() - start_time) * 1000)
      return {"map_id": f"iframe{map.id}", "map_link": map.map_link}

    except Exception as e:
      # Error: ValueError: You must specify a unique_id_field when creating a new project.
      if str(e) == 'You must specify a unique_id_field when creating a new project.':  # type: ignore
        logger.info("Nomic map does not exist yet course=%s type=%s (fewer than 20 queries or documents)",
                    course_name, type)
      else:
        logger.exception("get_nomic_map failed course=%s type=%s", course_name, type)
        self.sentry.capture_exception(e)
      return {"map_id": None, "map_link": None}

  def update_conversation_maps(self):
    """
    Updates all conversation maps in UIUC.Chat. To be called via a CRON job.
    Returns:
        str: 'success' or error message
    """
    try:

      projects = self.sql.getConvoMapDetails().data
      logger.debug("updating conversation maps projects=%d", len(projects))

      for project in projects:
        course_name = project['course_name']

        if not project['convo_map_id'] or project['convo_map_id'] == 'N/A':
          logger.debug("creating new conversation map course=%s", course_name)
          self.create_conversation_map(course_name)
          continue

        logger.debug("updating existing conversation map course=%s", course_name)
        last_uploaded_id = project['last_uploaded_convo_id']
        total_convo_count = self.sql.getCountFromLLMConvoMonitor(course_name, last_id=last_uploaded_id).count

        if total_convo_count == 0:
          logger.debug("no new conversations for the map course=%s", course_name)
          # self.create_map_index(course_name, index_field="first_query", map_type="conversation")
          continue

        logger.debug("unlogged conversations course=%s count=%d", course_name, total_convo_count)
        combined_dfs = []
        current_count = 0

        while current_count < total_convo_count:
          response = self.sql.getAllConversationsBetweenIds(course_name, last_uploaded_id, 0, 100)
          if not response.data:
            break

          combined_dfs.append(pd.DataFrame(response.data))
          current_count += len(response.data)

          if combined_dfs:
            final_df = pd.concat(combined_dfs, ignore_index=True)
            embeddings, metadata = self.data_prep_for_convo_map(final_df)

            map_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                              f"Conversation Map for {course_name}".replace("_", "-")).replace(" ", "-").lower()

            result = self.append_to_map(embeddings=embeddings, metadata=metadata, map_name=map_name)

            if result == "success":
              last_uploaded_id = int(final_df['id'].iloc[-1])
              self.sql.updateProjects(course_name, {'last_uploaded_convo_id': last_uploaded_id})

            else:
              logger.error("updating conversation map failed course=%s: %s", course_name, result)
              break

            combined_dfs = []
        
        self.create_map_index(course_name, index_field="first_query", map_type="conversation")

        logger.debug("processed all conversations for the map course=%s", course_name)
        time.sleep(10)

      logger.info("finished updating conversation maps projects=%d", len(projects))
      return "success"

    except Exception as e:
      error_msg = f"Error in updating conversation maps: {e}"
      logger.exception("updating conversation maps failed")
      self.sentry.capture_exception(e)
      return error_msg

  def update_document_maps(self):
    """
    Updates all document maps in UIUC.Chat by processing and uploading documents in batches.
    
    Returns:
        str: Status of document maps update process
    """
    DOCUMENT_MAP_PREFIX = "Document Map for "
    BATCH_SIZE = 100
    UPLOAD_THRESHOLD = 500

    try:
      # Fetch all projects
      projects = self.sql.getDocMapDetails().data
      logger.debug("updating document maps projects=%d", len(projects))

      for project in projects:
        try:
          course_name = project['course_name']

          # Determine whether to create or update map
          if not project.get('doc_map_id') or project.get('doc_map_id') == 'N/A':
            status = self.create_document_map(course_name)
            logger.debug("created new document map course=%s status=%s", course_name, status)
            continue

          # Check for new documents
          last_uploaded_doc_id = project['last_uploaded_doc_id']
          response = self.sql.getCountFromDocuments(course_name, last_id=last_uploaded_doc_id)

          if not response.count:
            logger.debug("no new documents for the map course=%s", course_name)
            continue

          # Prepare update process
          total_doc_count = response.count
          logger.debug("unlogged documents course=%s count=%d", course_name, total_doc_count)

          project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                                f"{DOCUMENT_MAP_PREFIX}{course_name}".replace(" ", "-").replace("_", "-").lower())
          first_id = last_uploaded_doc_id

          combined_dfs = []
          current_doc_count = 0
          doc_count = 0
          batch_number = 0

          while current_doc_count < total_doc_count:
            # Fetch documents in batches
            response = self.sql.getDocsForIdsGte(course_name=course_name, first_id=first_id, limit=BATCH_SIZE)

            if not response.data:
              break

            df = pd.DataFrame(response.data)
            combined_dfs.append(df)
            current_doc_count += len(response.data)
            doc_count += len(response.data)

            # Determine if we should process the batch
            should_process = (doc_count >= UPLOAD_THRESHOLD or current_doc_count >= total_doc_count)

            if should_process:
              batch_number += 1
              logger.debug("processing document map batch=%d course=%s", batch_number, course_name)

              final_df = pd.concat(combined_dfs, ignore_index=True)
              embeddings, metadata = self.data_prep_for_doc_map(final_df)

              if not embeddings.size:
                logger.debug("no embeddings found, skipping batch course=%s", course_name)
                continue

              # Upload to map
              result = self.append_to_map(embeddings=embeddings, metadata=metadata, map_name=project_name)

              if result == "success":
                last_id = int(final_df['id'].iloc[-1])
                project_info = {'last_uploaded_doc_id': last_id}
                self.sql.updateProjects(course_name, project_info)

                logger.debug("completed document map batch=%d course=%s documents=%d/%d", batch_number, course_name,
                             current_doc_count, total_doc_count)
              else:
                raise Exception(f"Batch upload failed: {result}")

              # Reset for next batch
              combined_dfs = []
              doc_count = 0

            # Prepare for next iteration
            first_id = response.data[-1]['id'] + 1

            # Exit condition to prevent infinite loop
            if current_doc_count >= total_doc_count:
              break

          # Rebuild map after all documents are processed
          self.create_map_index(course_name, index_field="text", map_type="document")

          logger.debug("processed all documents for the map course=%s batches=%d", course_name, batch_number)
          time.sleep(10)

        except Exception as e:
          logger.exception("updating document map failed course=%s", course_name)
          self.sentry.capture_exception(e)
          continue

      logger.info("finished updating document maps projects=%d", len(projects))
      return "success"

    except Exception as e:
      logger.exception("updating document maps failed")
      self.sentry.capture_exception(e)
      return f"Error in update_document_maps: {e}"

  def create_conversation_map(self, course_name: str):
    """
    Creates a conversation map for a given course from conversations in the database.
    Args:
        course_name (str): Name of the course to create a conversation map for.
    Returns:
        str: Status of map creation process
    """
    NOMIC_MAP_NAME_PREFIX = 'Conversation Map for '
    BATCH_SIZE = 100
    MIN_CONVERSATIONS = 20
    UPLOAD_THRESHOLD = 500

    try:
      # Check if map already exists
      existing_map = self.sql.getConvoMapFromProjects(course_name)
      if existing_map.data and existing_map.data[0]['convo_map_id']:
        return "Map already exists for this course."

      # Validate conversation count
      response = self.sql.getCountFromLLMConvoMonitor(course_name, last_id=0)
      if not response.count or response.count < MIN_CONVERSATIONS:
        logger.info("cannot create conversation map course=%s conversations=%s (need %d)", course_name, response.count,
                    MIN_CONVERSATIONS)
        return f"Cannot create map: {'No new convos present' if not response.count else 'Less than 20 conversations'}"

      # Prepare map creation
      total_convo_count = response.count
      logger.debug("creating conversation map course=%s conversations=%d", course_name, total_convo_count)

      project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                            (NOMIC_MAP_NAME_PREFIX + course_name).replace(" ", "-").replace("_", "-").lower())
      first_id = response.data[0]['id'] - 1

      combined_dfs = []
      current_convo_count = 0
      convo_count = 0
      first_batch = True

      while current_convo_count < total_convo_count:
        # Fetch conversations in batches
        response = self.sql.getAllConversationsBetweenIds(course_name, first_id, 0, BATCH_SIZE)
        if not response.data:
          break

        df = pd.DataFrame(response.data)
        combined_dfs.append(df)
        current_convo_count += len(response.data)
        convo_count += len(response.data)
        logger.debug("fetched conversations course=%s batch=%d total=%d", course_name, convo_count, current_convo_count)

        # Process and upload batches when threshold is reached
        if convo_count >= UPLOAD_THRESHOLD or current_convo_count >= total_convo_count:
          final_df = pd.concat(combined_dfs, ignore_index=True)
          logger.debug("processing conversation map batch course=%s rows=%d", course_name, len(final_df))
          embeddings, metadata = self.data_prep_for_convo_map(final_df)

          if not embeddings.size:
            logger.debug("no embeddings found, skipping batch course=%s", course_name)
            continue

          # Create or append to map
          if first_batch:
            index_name = f"{course_name}_convo_index"
            map_title = f"{NOMIC_MAP_NAME_PREFIX}{course_name}"
            result = self.create_map(embeddings=embeddings, metadata=metadata, map_name=map_title, index_name=
                                     index_name, index_field="first_query")
          else:
            result = self.append_to_map(embeddings=embeddings,metadata=metadata, map_name=project_name)

          if result == "success":
            project = AtlasDataset(project_name)
            last_id = int(final_df['id'].iloc[-1])
            project_info = {'course_name': course_name, 'convo_map_id': project.id, 'last_uploaded_convo_id': last_id}
            logger.debug("conversation map project_info=%s", project_info)
            # Update or insert project info
            if existing_map.data:
              self.sql.updateProjects(course_name, project_info)
            else:
              self.sql.insertProject(project_info)

          else:
            logger.error("adding data to new conversation map failed course=%s: %s", course_name, result)
            return f"Did not append additional data to new map: {result}"

          # Reset for next batch
          combined_dfs = []
          convo_count = 0
          first_batch = False

        # Prepare for next iteration
        first_id = response.data[-1]['id']

      # Rebuild map
      self.create_map_index(course_name, index_field="first_query", map_type="conversation")
      return "success"

    except Exception as e:
      logger.exception("creating conversation map failed course=%s", course_name)
      self.sentry.capture_exception(e)
      return f"Error in creating conversation map: {str(e)}"

  def create_document_map(self, course_name: str):
    """
    Creates a document map for a given course from documents in the database.
    
    Args:
        course_name (str): Name of the course to create a document map for.
    
    Returns:
        str: Status of map creation process
    """
    DOCUMENT_MAP_PREFIX = "Document Map for "
    BATCH_SIZE = 100
    UPLOAD_THRESHOLD = 500
    MIN_DOCUMENTS = 20
    # TechServicesProject_DEMO
    try:
      # Check if document map already exists
      project_name = DOCUMENT_MAP_PREFIX + course_name
      existing_map = self.sql.getDocMapFromProjects(course_name=course_name)
      if existing_map.data and existing_map.data[0]['doc_map_id']:
        return "Map already exists."

      # Validate document count
      response = self.sql.getCountFromDocuments(course_name, last_id=0)
      if not response.count or response.count < MIN_DOCUMENTS:
        return f"Cannot create map: {'No new docs present' if not response.count else 'Less than 20 documents'}"

      # Prepare map creation
      total_doc_count = response.count
      logger.debug("creating document map course=%s documents=%d", course_name, total_doc_count)

      project_name = re.sub(r'[^a-zA-Z0-9\s-]', '', project_name.replace(" ", "-").replace("_", "-").lower())
      first_id = response.data[0]['id'] - 1

      combined_dfs = []
      current_doc_count = 0
      doc_count = 0
      first_batch = True

      while current_doc_count < total_doc_count:
        # Fetch documents in batches
        response = self.sql.getDocsForIdsGte(course_name=course_name, first_id=first_id, limit=BATCH_SIZE)
        if not response.data:
          logger.debug("no more documents found course=%s", course_name)
          break

        df = pd.DataFrame(response.data)
        combined_dfs.append(df)
        current_doc_count += len(response.data)
        doc_count += len(response.data)

        # Determine if we should process the batch
        should_process = (doc_count >= UPLOAD_THRESHOLD or current_doc_count >= total_doc_count or
                          current_doc_count == total_doc_count)

        if should_process:
          final_df = pd.concat(combined_dfs, ignore_index=True)
          logger.debug("processing document map batch course=%s rows=%d", course_name, len(final_df))
          embeddings, metadata = self.data_prep_for_doc_map(final_df)

          if not embeddings.size:
            logger.info("no embeddings found, skipping document map course=%s", course_name)
            return "No embeddings found. Skipping project."

          # Create or append to map
          index_name = f"{course_name}_doc_index"
          if first_batch:
            map_title = f"{DOCUMENT_MAP_PREFIX}{course_name}"
            result = self.create_map(embeddings, metadata, map_title, index_name, index_field="text")
          else:
            result = self.append_to_map(embeddings=embeddings, metadata=metadata, map_name=project_name)

          if result == "success":
            project = AtlasDataset(project_name)
            last_id = int(final_df['id'].iloc[-1])
            logger.debug("document map last_id=%s course=%s", last_id, course_name)
            project_info = {'course_name': course_name, 'doc_map_id': project.id, 'last_uploaded_doc_id': last_id}

            # Update or insert project info
            if existing_map.data:
              self.sql.updateProjects(course_name, project_info)
            else:
              self.sql.insertProject(project_info)

          else:
            logger.error("uploading document map batch failed course=%s: %s", course_name, result)
            return f"Error in uploading batch for {course_name}: {result}"

          # Reset for next batch
          combined_dfs = []
          doc_count = 0
          first_batch = False

        # Prepare for next iteration
        first_id = response.data[-1]['id'] + 1
        logger.debug("document map progress course=%s documents=%d", course_name, current_doc_count)
        # Exit condition to prevent infinite loop
        if current_doc_count >= total_doc_count:
          break

      # Rebuild the map
      self.create_map_index(course_name, index_field="text", map_type="document")
      return "success"

    except Exception as e:
      logger.exception("creating document map failed course=%s", course_name)
      self.sentry.capture_exception(e)
      return f"Error in creating document map: {str(e)}"

  def clean_up_conversation_maps(self):
    """
    Deletes all Nomic maps and re-creates them. To be called weekly via a CRON job.
    This is to clean up all the new map indices generated daily.
    """
    try:
      # step 1: get all conversation maps from SQL
      data = self.sql.getProjectsWithConvoMaps().data
      logger.debug("cleaning up conversation maps projects=%d", len(data))
      # step 2: delete all conversation maps from Nomic
      for project in data:
        try:
          project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                                (f"Conversation Map for {project['course_name']}").replace(" ",
                                                                                           "-").replace("_",
                                                                                                        "-").lower())
          logger.debug("deleting conversation map %s", project_name)
          dataset = AtlasDataset(project_name)
          dataset.delete()

          # step 3: update SQL table to remove map info
          self.sql.updateProjects(project['course_name'], {
              'convo_map_id': None,
              'last_uploaded_convo_id': None,
              'conversation_map_index': None
          })

        except Exception as e:
          logger.exception("deleting conversation map failed course=%s", project['course_name'])
          self.sentry.capture_exception(e)
          continue
      logger.info("deleted conversation maps projects=%d", len(data))

      # step 4: re-create conversation maps by calling update function
      status = self.update_conversation_maps()  # this function will create new maps if not already present!
      logger.info("conversation map re-creation status=%s", status)

      return "success"
    except Exception as e:
      logger.exception("cleaning up conversation maps failed")
      self.sentry.capture_exception(e)
      return f"Error in cleaning up conversation maps: {str(e)}"

  def clean_up_document_maps(self):
    """
    Deletes all Nomic maps and re-creates them. To be called weekly via a CRON job.
    This is to clean up all the new map indices generated daily.
    """
    try:
      # step 1: get all document maps from SQL
      data = self.sql.getProjectsWithDocMaps().data
      logger.debug("cleaning up document maps projects=%d", len(data))
      # step 2: delete all document maps from Nomic
      for project in data:
        try:
          project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                                (f"Document Map for {project['course_name']}").replace(" ", "-").replace("_",
                                                                                                         "-").lower())
          logger.debug("deleting document map %s", project_name)
          dataset = AtlasDataset(project_name)
          dataset.delete()

          # step 3: update SQL table to remove map info
          self.sql.updateProjects(project['course_name'], {
              'doc_map_id': None,
              'last_uploaded_doc_id': None,
              'document_map_index': None
          })

        except Exception as e:
          logger.exception("deleting document map failed course=%s", project['course_name'])
          self.sentry.capture_exception(e)
          continue

      # step 4: re-create conversation maps by calling update function
      status = self.update_document_maps()  # this function will create new maps if not already present!
      logger.info("document map re-creation projects=%d status=%s", len(data), status)

      return "success"
    except Exception as e:
      logger.exception("cleaning up document maps failed")
      self.sentry.capture_exception(e)
      return f"Error in cleaning up document maps: {str(e)}"


#   ## -------------------------------- SUPPLEMENTARY MAP FUNCTIONS --------------------------------- ##

  def rebuild_map(self, course_name: str, map_type: str):
    """
    Rebuilds a given map in Nomic.
    Args:
        course_name (str): Name of the course
        map_type (str): Type of map ('document' or 'conversation')
    Returns:
        str: Status of map rebuilding process
    """
    MAP_PREFIXES = {'document': 'Document Map for ', 'conversation': 'Conversation Map for '}

    try:
      project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                            (MAP_PREFIXES.get(map_type.lower(), '') + course_name).replace(" ",
                                                                                           "-").replace("_",
                                                                                                        "-").lower())
      logger.debug("rebuilding map %s", project_name)
      project = AtlasDataset(project_name)

      if project.is_accepting_data:
        project.update_indices(rebuild_topic_models=True)

      return "success"

    except Exception as e:
      logger.exception("rebuilding map failed course=%s map_type=%s", course_name, map_type)
      self.sentry.capture_exception(e)
      return f"Error in rebuilding map: {e}"

  def create_map_index(self, course_name: str, index_field: str, map_type: str):
    """
    Creates a new index for a given map in Nomic.
    """
    MAP_PREFIXES = {'document': 'Document Map for ', 'conversation': 'Conversation Map for '}
    try:
      map_type = map_type.lower()
      # create index
      project_name = re.sub(r'[^a-zA-Z0-9\s-]', '',
                            (MAP_PREFIXES.get(map_type, '') + course_name).replace(" ", "-").replace("_", "-").lower())
      logger.debug("creating index for map %s", project_name)

      project = AtlasDataset(project_name)

      #current_day = datetime.datetime.now().day
      index_name = f"{project_name}_index_{datetime.datetime.now().strftime('%Y-%m-%d')}"

      project.create_index(name=index_name, indexed_field=index_field, topic_model=True, duplicate_detection=True)

      # update index name to SQL database
      self.sql.updateProjects(course_name, {f"{map_type}_map_index": index_name})

      return "success"
    except Exception as e:
      logger.exception("creating map index failed course=%s map_type=%s", course_name, map_type)
      self.sentry.capture_exception(e)
      return f"Error in creating index: {e}"

  def create_map(self, embeddings, metadata, map_name, index_name, index_field):
    """
    Creates a Nomic map with topic modeling and duplicate detection.
    
    Args:
        embeddings (np.ndarray): Document embeddings if available
        metadata (pd.DataFrame): Metadata for the map
        map_name (str): Name of the map to create
        index_name (str): Name of the index to create
        index_field (str): Field to be indexed
        
    Returns:
        str: 'success' or error message
    """
    logger.debug("creating map %s", map_name)

    try:
        project = AtlasDataset(
            map_name,
            unique_id_field="id",
        )
        
        # Check if embeddings is a non-empty numpy array
        if isinstance(embeddings, np.ndarray) and embeddings.size > 0:
            project.add_data(data=metadata, embeddings=embeddings)
        return "success"

    except Exception as e:
        logger.exception("creating Nomic map failed map=%s", map_name)
        return f"Error in creating map: {e}"

  @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=10, max=600))
  def append_to_map(self, embeddings, metadata, map_name):
    """
    Appends new data to an existing Nomic map.
    
    Args:
        metadata (pd.DataFrame): Metadata for the map update
        map_name (str): Name of the target map
        
    Returns:
        str: 'success' or error message
    """
    try:
        logger.debug("appending to map %s", map_name)
        project = AtlasDataset(map_name)

        start_time = time.monotonic()
        while time.monotonic() - start_time < 60:
            if project.is_accepting_data:
                if isinstance(embeddings, np.ndarray) and embeddings.size > 0:
                    project.add_data(data=metadata, embeddings=embeddings)
                return "success"
            
            logger.debug("map %s is indexing, waiting 10 s", map_name)
            time.sleep(10)

        return "Project busy"

    except Exception as e:
        logger.exception("appending to Nomic map failed map=%s", map_name)
        return f"Error in appending to map: {e}"

  def data_prep_for_convo_map(self, df: pd.DataFrame) -> list:
    """
    Prepares conversation data from Supabase for Nomic map upload.
    Args:
        df (pd.DataFrame): Dataframe of documents from Supabase   
    Returns:
        pd.DataFrame: Processed metadata for map creation, or None if error occurs
    """
    logger.debug("preparing conversation data for map rows=%d", len(df))

    try:
      metadata = []
      raw_text = []
      current_time = datetime.datetime.now()

      for _, row in df.iterrows():
        created_at = datetime.datetime.strptime(row['created_at'],
                                                "%Y-%m-%dT%H:%M:%S.%f%z")
        messages = row['convo']['messages']
        first_message = messages[0]['content']
        if isinstance(first_message, list):
          first_message = first_message[0].get('text', '')

        conversation = []
        for message in messages:
          emoji = "🙋 " if message['role'] == 'user' else "🤖 "
          content = message['content']
          text = content[0].get('text', '') if isinstance(content, list) else content
          conversation.append(f"\n>>> {emoji}{message['role']}: {text}\n")

        metadata.append({
            "course": row['course_name'],
            "conversation": ''.join(conversation),
            "conversation_id": row['convo']['id'],
            "id": row['id'],
            "user_email": row['user_email'] or "",
            "first_query": first_message,
            "created_at": created_at,
            "modified_at": current_time
        })
        raw_text.append(first_message)
      
      # generate embeddings using ollama
      response = self.ollama_client.embed(model='nomic-embed-text:v1.5', input=raw_text)
      
      embeddings = response['embeddings']
      embeddings = np.array(embeddings)
      result = pd.DataFrame(metadata)
      logger.debug("conversation map data embeddings=%s metadata=%s", embeddings.shape, result.shape)
      return [embeddings, result]

    except Exception as e:
      logger.exception("preparing conversation data for map failed")
      self.sentry.capture_exception(e)
      return [np.array([]), pd.DataFrame()]

  def data_prep_for_doc_map(self, df: pd.DataFrame) -> list:
    try:
        metadata = []
        embeddings = []
        current_time = datetime.datetime.now()

        for _, row in df.iterrows():
            created_at = datetime.datetime.strptime(row['created_at'], 
                                                  "%Y-%m-%dT%H:%M:%S.%f%z")

            for idx, context in enumerate(row['contexts'], 1):
                # Validate embedding before adding
                embedding = context.get('embedding')
                if embedding is not None and isinstance(embedding, (list, np.ndarray)):
                    # Convert to list if numpy array
                    if isinstance(embedding, np.ndarray):
                        embedding = embedding.tolist()
                    
                    # Check if embedding has the expected dimension
                    if len(embedding) > 0:  # Add your expected dimension check here
                        embeddings.append(embedding)
                        metadata.append({
                            "id": f"{row['id']}_{idx}",
                            "created_at": created_at,
                            "s3_path": row['s3_path'],
                            "url": row['url'] or "",
                            "base_url": row['base_url'] or "",
                            "readable_filename": row['readable_filename'],
                            "modified_at": current_time,
                            "text": context['text']
                        })

        # Convert to numpy array only if we have valid embeddings
        if embeddings and len(embeddings) > 20:
            embeddings = np.array(embeddings)
            logger.debug("document map data embeddings=%s", embeddings.shape)
            return [embeddings, pd.DataFrame(metadata)]
        else:
            logger.debug("no valid embeddings found for document map")
            return [np.array([]), pd.DataFrame()]

    except Exception as e:
        logger.exception("preparing document data for map failed")
        self.sentry.capture_exception(e)
        return [np.array([]), pd.DataFrame()]
