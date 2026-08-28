package com.example.cognito.util

import android.os.Environment
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.io.File

data class ScannedDocument(
    val id: String,
    val name: String,
    val path: String,
    val sizeBytes: Long,
    val extension: String,
    val content: String,
    val clusterId: Int? = null,
    val clusterName: String? = null,
    val xCoord: Float? = null,
    val yCoord: Float? = null
)

object DocumentStore {
    val documents = mutableStateListOf<ScannedDocument>()
    var totalSizeBytes by mutableStateOf(0L)
    var isScanning by mutableStateOf(false)
    var isModelTrained by mutableStateOf(false)

    fun clear() {
        documents.clear()
        totalSizeBytes = 0L
        isModelTrained = false
    }

    fun add(doc: ScannedDocument) {
        documents.add(doc)
        totalSizeBytes += doc.sizeBytes
    }
}

object DocumentScanner {

    private val SUPPORTED_EXTENSIONS = setOf("pdf", "docx", "pptx", "txt", "md", "jpg", "jpeg", "png", "bmp")
    private val EXCLUDED_DIR_NAMES = setOf(
        "Android", "node_modules", "venv", "__pycache__", 
        "DCIM", "Pictures", "Movies", "Music", 
        "Alarms", "Ringtones", "Notifications", "Podcasts", "Audiobooks"
    )
    
    // Scans the phone's primary storage (Downloads, Documents, etc.)
    fun scanDeviceStorage(context: android.content.Context, onProgress: (String) -> Unit, onCompleted: (Int) -> Unit) {
        DocumentStore.isScanning = true
        DocumentStore.clear()
        
        val directoriesToScan = listOf(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
            Environment.getExternalStorageDirectory() // Fallback to root external storage
        )
        
        val visitedPaths = mutableSetOf<String>()
        var docIdCounter = 1

        for (dir in directoriesToScan) {
            if (dir == null || !dir.exists() || !dir.isDirectory) continue
            
            val absolutePath = dir.absolutePath
            if (visitedPaths.contains(absolutePath)) continue
            visitedPaths.add(absolutePath)
            
            onProgress("Scanning folder: ${dir.name}...")
            
            // Recursive scan
            scanDirectory(dir, visitedPaths) { file ->
                val ext = file.extension.lowercase()
                if (SUPPORTED_EXTENSIONS.contains(ext)) {
                    onProgress("Reading file: ${file.name}...")
                    val textContent = TextExtractors.extractText(context, file)
                    
                    if (textContent.isNotBlank()) {
                        val doc = ScannedDocument(
                            id = docIdCounter.toString(),
                            name = file.name,
                            path = file.absolutePath,
                            sizeBytes = file.length(),
                            extension = ext,
                            content = textContent
                        )
                        DocumentStore.add(doc)
                        docIdCounter++
                    }
                }
            }
        }
        
        DocumentStore.isScanning = false
        onCompleted(DocumentStore.documents.size)
    }

    private fun scanDirectory(dir: File, visited: MutableSet<String>, onFileFound: (File) -> Unit) {
        val files = try {
            dir.listFiles()
        } catch (e: SecurityException) {
            null
        } ?: return

        for (file in files) {
            if (file.name.startsWith(".") || EXCLUDED_DIR_NAMES.contains(file.name)) {
                continue
            }
            if (file.isDirectory) {
                val path = file.absolutePath
                if (!visited.contains(path)) {
                    visited.add(path)
                    scanDirectory(file, visited, onFileFound)
                }
            } else {
                onFileFound(file)
            }
        }
    }
    
    val demoDocs = listOf(
        Triple(
            "aadhaar_card_mock.txt", 
            "txt", 
            "GOVERNMENT OF INDIA\nUNIQUE IDENTIFICATION AUTHORITY OF INDIA\n\nTo:\nRajesh Kumar\n123, Green Park Colony,\nNew Delhi - 110016\n\nYour Aadhaar Number / Aadhaar card details:\n9876-5432-1098\n\nINFORMATION:\nName: Rajesh Kumar\nGender: Male\nDate of Birth: 15/08/1988\nAddress: New Delhi\n"
        ),
        Triple(
            "q1_earnings_report.md", 
            "md", 
            "# Q1 2026 Financial Earnings Review\n\n## Cognito Corp - High Privacy Local Intelligence\n\n### Operational Highlights:\n- Total revenue grew by 24% year-over-year, reaching $4.8M.\n- Gross margins sustained at 78% due to optimized offline infrastructure costs.\n- Local AI processing reduced cloud expenses by 40%.\n- Net cash flow from operating activities was positive at $1.2M.\n\n### Strategic Objectives:\n1. Move all business critical data (DOCX, PDF, PPTX) to edge devices.\n2. Scale TFLite QA local inference deployment."
        ),
        Triple(
            "ai_agentic_workflows.txt", 
            "txt", 
            "AI Agentic Workflows and Multi-Agent Systems\n\nAn AI Agent is a system that operates in a loop: Plan -> Act -> Observe -> Self-Correct.\n\nKey Properties:\n1. Autonomy: Decision loops to decide tasks.\n2. Tool Use: Interacting with local search APIs.\n3. Memory: Long term storage (like documents context).\n\nBy running extractive QA models like MobileBERT offline, agents can retrieve database keys from PDF files on device securely."
        )
    )

    // Generates mock demo files inside the app's files directory so that the app works instantly!
    fun loadDemoData(context: android.content.Context, onProgress: (String) -> Unit, onCompleted: (Int) -> Unit) {
        DocumentStore.isScanning = true
        DocumentStore.clear()
        
        onProgress("Loading Cognito offline demo dataset...")
        
        val documentsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        if (documentsDir != null && !documentsDir.exists()) {
            try {
                documentsDir.mkdirs()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        for ((idx, docData) in demoDocs.withIndex()) {
            val (name, ext, content) = docData
            onProgress("Writing & Parsing ${ext.uppercase()}: $name...")
            
            var targetPath = "/storage/emulated/0/Documents/$name"
            if (documentsDir != null && documentsDir.exists()) {
                val file = File(documentsDir, name)
                try {
                    file.writeText(content)
                    targetPath = file.absolutePath
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            
            // Simulate brief loading delay for premium feel
            Thread.sleep(300)
            
            val fileLength = if (documentsDir != null) {
                val f = File(documentsDir, name)
                if (f.exists()) f.length() else content.length.toLong()
            } else {
                content.length.toLong()
            }

            val doc = ScannedDocument(
                id = (idx + 1).toString(),
                name = name,
                path = targetPath,
                sizeBytes = fileLength,
                extension = ext,
                content = content
            )
            DocumentStore.add(doc)
        }
        
        DocumentStore.isScanning = false
        DocumentStore.isModelTrained = true // Mark trained since demo is pre-indexed
        onCompleted(DocumentStore.documents.size)
    }

    fun loadSingleDemoDoc(context: android.content.Context, name: String, ext: String, content: String): Boolean {
        val documentsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        if (documentsDir != null && !documentsDir.exists()) {
            documentsDir.mkdirs()
        }
        val file = File(documentsDir, name)
        return try {
            file.writeText(content)
            val doc = ScannedDocument(
                id = (DocumentStore.documents.size + 1).toString(),
                name = name,
                path = file.absolutePath,
                sizeBytes = file.length(),
                extension = ext,
                content = content
            )
            if (DocumentStore.documents.none { it.name == name }) {
                DocumentStore.add(doc)
            }
            DocumentStore.isModelTrained = true
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun createCustomFile(context: android.content.Context, name: String, ext: String, content: String): Boolean {
        val documentsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        if (documentsDir != null && !documentsDir.exists()) {
            documentsDir.mkdirs()
        }
        val file = File(documentsDir, name)
        return try {
            file.writeText(content)
            val doc = ScannedDocument(
                id = (DocumentStore.documents.size + 1).toString(),
                name = name,
                path = file.absolutePath,
                sizeBytes = file.length(),
                extension = ext,
                content = content
            )
            if (DocumentStore.documents.none { it.name == name }) {
                DocumentStore.add(doc)
            }
            DocumentStore.isModelTrained = true
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
