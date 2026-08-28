package com.example.cognito

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.res.painterResource

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.cognito.model.QAAnswerResult
import com.example.cognito.model.QASearchEngine
import com.example.cognito.util.AuthManager
import com.example.cognito.util.DocumentScanner
import com.example.cognito.util.DocumentStore
import com.example.cognito.util.ScannedDocument
import com.example.cognito.util.TextExtractors
import com.example.cognito.util.UserData
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.activity.result.contract.ActivityResultContracts
import java.io.File
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {

    private val PERMISSION_REQUEST_CODE = 200

    // State of permission and theme
    private var hasStoragePermission by mutableStateOf(false)
    private var isDarkMode by mutableStateOf(true)

    private val selectFileLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        uri?.let {
            importSelectedFile(it)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize PDFBox library helper
        TextExtractors.init(this)
        AuthManager.init(this)

        checkPermissionsState()

        setContent {
            CognitoAppTheme(isDark = isDarkMode) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val user = AuthManager.currentUser
                    if (user == null) {
                        AuthScreen(
                            onLoginSuccess = { checkPermissionsState() }
                        )
                    } else if (hasStoragePermission) {
                        DashboardScreen(
                            onScanClick = { triggerFolderScan() },
                            onLoadDemoClick = { triggerDemoLoad() },
                            onAddFileClick = { selectFileLauncher.launch(arrayOf("*/*")) }
                        )
                    } else {
                        PermissionGateScreen(
                            onRequestPermissionClick = { requestStoragePermission() }
                        )
                    }
                }
            }
        }
    }

    private fun checkPermissionsState() {
        hasStoragePermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                this, 
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.data = Uri.parse("package:" + packageName)
                startActivityForResult(intent, PERMISSION_REQUEST_CODE)
            } catch (e: Exception) {
                val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                startActivityForResult(intent, PERMISSION_REQUEST_CODE)
            }
        } else {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE),
                PERMISSION_REQUEST_CODE
            )
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            checkPermissionsState()
            if (hasStoragePermission) {
                Toast.makeText(this, "Permission Granted!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, 
        permissions: Array<String>, 
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            checkPermissionsState()
            if (hasStoragePermission) {
                Toast.makeText(this, "Storage Access Granted!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Permission denied. Storage access is required.", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Runs scanning in a background thread using coroutines
    private var scanProgressText by mutableStateOf("Ready to scan storage.")

    private fun triggerFolderScan() {
        CoroutineScope(Dispatchers.IO).launch {
            DocumentScanner.scanDeviceStorage(
                context = this@MainActivity,
                onProgress = { msg ->
                    CoroutineScope(Dispatchers.Main).launch {
                        scanProgressText = msg
                    }
                },
                onCompleted = { count ->
                    CoroutineScope(Dispatchers.Main).launch {
                        scanProgressText = "Scan completed! Found $count files."
                        Toast.makeText(this@MainActivity, "Scanned $count files!", Toast.LENGTH_SHORT).show()
                    }
                }
            )
        }
    }

    private fun triggerDemoLoad() {
        CoroutineScope(Dispatchers.IO).launch {
            DocumentScanner.loadDemoData(
                context = this@MainActivity,
                onProgress = { msg ->
                    CoroutineScope(Dispatchers.Main).launch {
                        scanProgressText = msg
                    }
                },
                onCompleted = { count ->
                    CoroutineScope(Dispatchers.Main).launch {
                        scanProgressText = "Demo data loaded. $count mock files available."
                        Toast.makeText(this@MainActivity, "Demo files loaded successfully!", Toast.LENGTH_SHORT).show()
                    }
                }
            )
        }
    }

    private fun importSelectedFile(uri: Uri) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                var name = "unknown_file"
                var size = 0L
                val cursor = contentResolver.query(uri, null, null, null, null)
                cursor?.use {
                    if (it.moveToFirst()) {
                        val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = it.getColumnIndex(android.provider.OpenableColumns.SIZE)
                        if (nameIndex != -1) name = it.getString(nameIndex)
                        if (sizeIndex != -1) size = it.getLong(sizeIndex)
                    }
                }

                val ext = name.substringAfterLast(".", "").lowercase()
                val supported = setOf("pdf", "docx", "pptx", "txt", "md", "jpg", "jpeg", "png", "bmp")
                
                if (!supported.contains(ext)) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Unsupported format: .$ext. Choose PDF, DOCX, PPTX, TXT, MD or Images (JPG, PNG, BMP).", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }

                val inputStream = contentResolver.openInputStream(uri)
                if (inputStream == null) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Failed to open file.", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }
                
                val tempFile = File(cacheDir, "temp_import_${System.currentTimeMillis()}_$name")
                tempFile.outputStream().use { outputStream ->
                    inputStream.copyTo(outputStream)
                }

                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Parsing $name...", Toast.LENGTH_SHORT).show()
                }
                
                val textContent = TextExtractors.extractText(this@MainActivity, tempFile)
                tempFile.delete()

                if (textContent.isNotBlank()) {
                    withContext(Dispatchers.Main) {
                        val doc = ScannedDocument(
                            id = (DocumentStore.documents.size + 1).toString(),
                            name = name,
                            path = uri.toString(),
                            sizeBytes = size,
                            extension = ext,
                            content = textContent
                        )
                        if (DocumentStore.documents.none { it.name == name }) {
                            DocumentStore.add(doc)
                        }
                        DocumentStore.isModelTrained = true
                        Toast.makeText(this@MainActivity, "$name imported and indexed!", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Could not extract text from $name.", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Error adding file: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun syncWithPC(pcIp: String, onProgress: (String) -> Unit, onCompleted: (Boolean, String) -> Unit) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                onProgress("Connecting to PC Sync Server...")
                val serverUrl = "http://$pcIp:8000"
                
                val statusUrl = URL("$serverUrl/api/sync/status")
                val statusConn = statusUrl.openConnection() as HttpURLConnection
                statusConn.requestMethod = "GET"
                statusConn.connectTimeout = 5000
                statusConn.readTimeout = 5000
                if (statusConn.responseCode != 200) {
                    statusConn.disconnect()
                    withContext(Dispatchers.Main) {
                        onCompleted(false, "Failed to connect to server. Check IP address.")
                    }
                    return@launch
                }
                statusConn.disconnect()
                
                onProgress("Uploading local documents...")
                val pushUrl = URL("$serverUrl/api/sync/push")
                val pushConn = pushUrl.openConnection() as HttpURLConnection
                pushConn.requestMethod = "POST"
                pushConn.setRequestProperty("Content-Type", "application/json")
                pushConn.doOutput = true
                pushConn.connectTimeout = 10000
                pushConn.readTimeout = 10000
                
                val requestJson = JSONObject()
                val documentsArray = JSONArray()
                
                val localDocs = DocumentStore.documents.toList()
                for (doc in localDocs) {
                    val docJson = JSONObject()
                    docJson.put("name", doc.name)
                    docJson.put("path", doc.path)
                    docJson.put("sizeBytes", doc.sizeBytes)
                    docJson.put("extension", doc.extension)
                    docJson.put("content", doc.content)
                    documentsArray.put(docJson)
                }
                requestJson.put("documents", documentsArray)
                
                val writer = OutputStreamWriter(pushConn.outputStream)
                writer.write(requestJson.toString())
                writer.flush()
                writer.close()
                
                if (pushConn.responseCode != 200) {
                    pushConn.disconnect()
                    withContext(Dispatchers.Main) {
                        onCompleted(false, "Error uploading local documents.")
                    }
                    return@launch
                }
                pushConn.disconnect()
                
                onProgress("Downloading PC documents...")
                val pullUrl = URL("$serverUrl/api/sync/pull")
                val pullConn = pullUrl.openConnection() as HttpURLConnection
                pullConn.requestMethod = "GET"
                pullConn.connectTimeout = 10000
                pullConn.readTimeout = 10000
                
                if (pullConn.responseCode == 200) {
                    val responseText = pullConn.inputStream.bufferedReader().use { it.readText() }
                    pullConn.disconnect()
                    
                    val responseJson = JSONObject(responseText)
                    val pcDocsArray = responseJson.getJSONArray("documents")
                    
                    withContext(Dispatchers.Main) {
                        var newDocsCount = 0
                        for (i in 0 until pcDocsArray.length()) {
                            val docObj = pcDocsArray.getJSONObject(i)
                            val id = docObj.getInt("id").toString()
                            val filename = docObj.getString("filename")
                            val filepath = docObj.getString("filepath")
                            val filesize = docObj.getLong("filesize")
                            val contentText = docObj.getString("content_text")
                            
                            val clusterId = if (docObj.isNull("cluster_id")) null else docObj.getInt("cluster_id")
                            val clusterName = if (docObj.isNull("cluster_name")) null else docObj.getString("cluster_name")
                            val xCoord = if (docObj.isNull("x_coord")) null else docObj.getDouble("x_coord").toFloat()
                            val yCoord = if (docObj.isNull("y_coord")) null else docObj.getDouble("y_coord").toFloat()
                            
                            val ext = filename.substringAfterLast(".", "txt").lowercase()
                            
                            val existing = DocumentStore.documents.firstOrNull { it.path == filepath }
                            val scannedDoc = ScannedDocument(
                                id = id,
                                name = filename,
                                path = filepath,
                                sizeBytes = filesize,
                                extension = ext,
                                content = contentText,
                                clusterId = clusterId,
                                clusterName = clusterName,
                                xCoord = xCoord,
                                yCoord = yCoord
                            )
                            
                            if (existing == null) {
                                DocumentStore.add(scannedDoc)
                                newDocsCount++
                            } else {
                                val idx = DocumentStore.documents.indexOf(existing)
                                if (idx != -1) {
                                    DocumentStore.documents[idx] = scannedDoc
                                }
                            }
                        }
                        DocumentStore.isModelTrained = true
                        onCompleted(true, "Synced successfully! Found $newDocsCount new documents from PC.")
                    }
                } else {
                    pullConn.disconnect()
                    withContext(Dispatchers.Main) {
                        onCompleted(false, "Error retrieving PC documents.")
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    onCompleted(false, "Connection error: ${e.message}")
                }
            }
        }
    }

    // ==========================================================================
    // Jetpack Compose Screens
    // ==========================================================================

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun DashboardScreen(
        onScanClick: () -> Unit,
        onLoadDemoClick: () -> Unit,
        onAddFileClick: () -> Unit
    ) {
        var activeTab by remember { mutableStateOf("dashboard") }
        var modelStatus by remember { mutableStateOf("Loading AI model...") }
        var modelLoaded by remember { mutableStateOf(false) }

        // Initialize local TFLite QA model on load in background thread
        LaunchedEffect(Unit) {
            withContext(Dispatchers.IO) {
                val success = QASearchEngine.init(this@MainActivity)
                withContext(Dispatchers.Main) {
                    if (success) {
                        modelStatus = "MobileBERT QA Model Loaded"
                        modelLoaded = true
                    } else {
                        modelStatus = "Model failed to load. Check assets folder."
                    }
                }
            }
        }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Image(
                                painter = painterResource(id = R.drawable.app_logo),
                                contentDescription = "Cognito Logo",
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(6.dp))
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Cognito",
                                fontFamily = FontFamily.SansSerif,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            Spacer(Modifier.width(10.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f))
                                    .border(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    "SECURE",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                        }
                    },
                    actions = {
                        val user = AuthManager.currentUser
                        if (user != null) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f), RoundedCornerShape(20.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = user.displayName,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1
                                )
                                Spacer(Modifier.width(6.dp))
                                IconButton(
                                    onClick = { AuthManager.signOut() },
                                    modifier = Modifier.size(22.dp)
                                ) {
                                    Text(text = "🚪", fontSize = 12.sp)
                                }
                            }
                            Spacer(Modifier.width(6.dp))
                        }
                        IconButton(onClick = { isDarkMode = !isDarkMode }) {
                            Text(
                                text = if (isDarkMode) "☀️" else "🌙",
                                fontSize = 20.sp
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                )
            },
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 8.dp
                ) {
                    NavigationBarItem(
                        selected = activeTab == "dashboard",
                        onClick = { activeTab = "dashboard" },
                        icon = { Text("📊", fontSize = 18.sp) },
                        label = { Text("Dashboard", fontSize = 11.sp) }
                    )
                    NavigationBarItem(
                        selected = activeTab == "map",
                        onClick = {
                            if (DocumentStore.isModelTrained) {
                                activeTab = "map"
                            } else {
                                Toast.makeText(this@MainActivity, "Sync with PC server to map coordinates first!", Toast.LENGTH_LONG).show()
                            }
                        },
                        icon = { Text("🗺️", fontSize = 18.sp) },
                        label = { Text("Topic Map", fontSize = 11.sp) }
                    )
                    NavigationBarItem(
                        selected = activeTab == "search",
                        onClick = { activeTab = "search" },
                        icon = { Text("🔍", fontSize = 18.sp) },
                        label = { Text("Search & QA", fontSize = 11.sp) }
                    )
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                when (activeTab) {
                    "dashboard" -> DashboardTabContent(
                        onScanClick = onScanClick,
                        onLoadDemoClick = onLoadDemoClick,
                        onAddFileClick = onAddFileClick
                    )
                    "map" -> MapScreenContent()
                    "search" -> SearchQAScreenContent()
                }
            }
        }
    }

    @Composable
    fun DashboardTabContent(
        onScanClick: () -> Unit,
        onLoadDemoClick: () -> Unit,
        onAddFileClick: () -> Unit
    ) {
        val scannedDocs = DocumentStore.documents
        var showDemoDataDialog by remember { mutableStateOf(false) }

        // Local Sync Settings States
        var pcIp by remember { mutableStateOf("192.168.1.100") }
        var isSyncing by remember { mutableStateOf(false) }
        var syncStatus by remember { mutableStateOf("Not synced") }
        var syncProgressText by remember { mutableStateOf("") }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "OFFLINE STATUS DASHBOARD",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF94A3B8)
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Scanned Files", fontSize = 11.sp, color = Color(0xFF64748B))
                            Text("${scannedDocs.size} files", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                        }
                        Column {
                            Text("Clustered Coordinates", fontSize = 11.sp, color = Color(0xFF64748B))
                            val coordinatesCount = scannedDocs.count { it.xCoord != null }
                            Text("$coordinatesCount files mapped", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF10B981))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = scanProgressText,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "PC LOCAL SYNCHRONIZATION",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF94A3B8)
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Sync database with Cognito PC server on your local Wi-Fi network.",
                        fontSize = 11.sp,
                        color = Color(0xFF64748B)
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = pcIp,
                            onValueChange = { pcIp = it },
                            label = { Text("PC LAN IP (e.g. 192.168.1.50)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            shape = RoundedCornerShape(8.dp),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 12.sp)
                        )
                        Button(
                            onClick = {
                                isSyncing = true
                                syncStatus = "Syncing..."
                                syncWithPC(
                                    pcIp = pcIp,
                                    onProgress = { msg -> syncProgressText = msg },
                                    onCompleted = { success, msg ->
                                        isSyncing = false
                                        syncStatus = if (success) "Synced" else "Failed"
                                        syncProgressText = msg
                                    }
                                )
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                            shape = RoundedCornerShape(8.dp),
                            enabled = !isSyncing
                        ) {
                            Text("Sync", fontSize = 12.sp)
                        }
                    }
                    if (syncProgressText.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = syncProgressText,
                            fontSize = 11.sp,
                            color = if (syncStatus == "Synced") Color(0xFF10B981) else if (syncStatus == "Failed") Color(0xFFEF4444) else MaterialTheme.colorScheme.secondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onScanClick,
                    modifier = Modifier.weight(1.2f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                ) {
                    Text("Scan Storage", fontSize = 12.sp, maxLines = 1)
                }
                Button(
                    onClick = { showDemoDataDialog = true },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                ) {
                    Text("Demo Files", fontSize = 12.sp, maxLines = 1)
                }
                Button(
                    onClick = onAddFileClick,
                    modifier = Modifier.weight(1.1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF06B6D4)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                ) {
                    Text("+ Add File", fontSize = 12.sp, maxLines = 1)
                }
            }

            Text(
                text = "INDEXED STORAGE DOCUMENTS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF94A3B8)
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (scannedDocs.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "No files indexed. Click Scan or Demo Data.",
                                fontSize = 13.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                } else {
                    items(scannedDocs) { doc ->
                        ScannedFileItem(doc)
                    }
                }
            }
        }

        if (showDemoDataDialog) {
            AlertDialog(
                onDismissRequest = { showDemoDataDialog = false },
                title = { Text("Offline Demo Datasets") },
                text = {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 280.dp)
                    ) {
                        items(DocumentScanner.demoDocs) { demo ->
                            val (name, ext, content) = demo
                            Card(
                                colors = CardDefaults.cardColors(containerColor = Color(0xFF1C2230)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(name, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 12.sp)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = content.take(120) + if (content.length > 120) "..." else "",
                                        fontSize = 10.sp,
                                        color = Color(0xFF94A3B8)
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Button(
                                        onClick = {
                                            val success = DocumentScanner.loadSingleDemoDoc(this@MainActivity, name, ext, content)
                                            if (success) {
                                                Toast.makeText(this@MainActivity, "Loaded $name!", Toast.LENGTH_SHORT).show()
                                            } else {
                                                Toast.makeText(this@MainActivity, "Failed to load $name", Toast.LENGTH_SHORT).show()
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                                        modifier = Modifier.align(Alignment.End),
                                        shape = RoundedCornerShape(4.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                    ) {
                                        Text("Load File", fontSize = 10.sp)
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showDemoDataDialog = false
                            onLoadDemoClick()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                    ) {
                        Text("Load All Demo Files", fontSize = 12.sp)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDemoDataDialog = false }) {
                        Text("Close", color = Color.White)
                    }
                },
                containerColor = Color(0xFF0C0E12),
                titleContentColor = Color.White,
                textContentColor = Color.White
            )
        }
    }

    @Composable
    fun MapScreenContent() {
        var scale by remember { mutableStateOf(1f) }
        var offset by remember { mutableStateOf(Offset.Zero) }
        var selectedDoc by remember { mutableStateOf<ScannedDocument?>(null) }

        val docs = DocumentStore.documents.filter { it.xCoord != null && it.yCoord != null }

        val colors = listOf(
            Color(0xFF6366F1), // Indigo
            Color(0xFF06B6D4), // Cyan
            Color(0xFF8B5CF6), // Violet
            Color(0xFF10B981), // Emerald
            Color(0xFFF59E0B), // Amber
            Color(0xFFEC4899), // Pink
            Color(0xFFF43F5E), // Rose
            Color(0xFF14B8A6)  // Teal
        )

        Box(modifier = Modifier.fillMaxSize().background(Color(0xFF020305))) {
            if (docs.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "No document coordinates found.\nPlease sync with your PC server\nto download clustered document coordinates.",
                        color = Color(0xFF64748B),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            } else {
                val transformState = rememberTransformableState { zoomChange, offsetChange, _ ->
                    scale = (scale * zoomChange).coerceIn(0.2f, 8f)
                    offset += offsetChange
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            detectTapGestures { tapOffset ->
                                val cx = size.width / 2 + offset.x
                                val cy = size.height / 2 + offset.y

                                var found: ScannedDocument? = null
                                for (doc in docs) {
                                    val px = cx + doc.xCoord!! * scale
                                    val py = cy + doc.yCoord!! * scale
                                    val dx = px - tapOffset.x
                                    val dy = py - tapOffset.y
                                    val dist = Math.sqrt((dx * dx + dy * dy).toDouble())
                                    if (dist <= 40.0) {
                                        found = doc
                                        break
                                    }
                                }
                                selectedDoc = found
                            }
                        }
                ) {
                    Canvas(
                        modifier = Modifier
                            .fillMaxSize()
                            .transformable(state = transformState)
                    ) {
                        val cx = size.width / 2 + offset.x
                        val cy = size.height / 2 + offset.y

                        val clusters = docs.groupBy { it.clusterId ?: 0 }

                        // 1. Draw connections
                        for ((clusterId, clusterDocs) in clusters) {
                            val color = colors[clusterId % colors.size]
                            for (i in clusterDocs.indices) {
                                for (j in (i + 1) until clusterDocs.size) {
                                    val n1 = clusterDocs[i]
                                    val n2 = clusterDocs[j]
                                    val x1 = n1.xCoord!!
                                    val y1 = n1.yCoord!!
                                    val x2 = n2.xCoord!!
                                    val y2 = n2.yCoord!!

                                    val dx = x1 - x2
                                    val dy = y1 - y2
                                    val dist = Math.sqrt((dx * dx + dy * dy).toDouble()).toFloat()

                                    if (dist < 100f) {
                                        val p1x = cx + x1 * scale
                                        val p1y = cy + y1 * scale
                                        val p2x = cx + x2 * scale
                                        val p2y = cy + y2 * scale
                                        val opacity = 0.15f * (1f - dist / 100f)

                                        drawLine(
                                            color = color.copy(alpha = opacity),
                                            start = Offset(p1x, p1y),
                                            end = Offset(p2x, p2y),
                                            strokeWidth = 2f
                                        )
                                    }
                                }
                            }
                        }

                        // 2. Draw nodes
                        for (doc in docs) {
                            val clusterId = doc.clusterId ?: 0
                            val color = colors[clusterId % colors.size]
                            val px = cx + doc.xCoord!! * scale
                            val py = cy + doc.yCoord!! * scale
                            val isSelected = selectedDoc?.id == doc.id
                            val radius = if (isSelected) 8.dp.toPx() else 5.dp.toPx()

                            drawCircle(
                                color = Color.White,
                                radius = radius + 2f,
                                center = Offset(px, py),
                                style = Stroke(width = if (isSelected) 3f else 1.5f)
                            )
                            drawCircle(
                                color = color,
                                radius = radius,
                                center = Offset(px, py)
                            )
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 24.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color(0xFF0C0E12).copy(alpha = 0.85f))
                        .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(50))
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "Pinch to zoom | Drag to pan | Tap nodes to preview",
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }

            selectedDoc?.let { doc ->
                Card(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .padding(16.dp)
                        .border(1.dp, Color(0xFF6366F1).copy(alpha = 0.5f), RoundedCornerShape(12.dp)),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0C0E12).copy(alpha = 0.95f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = doc.name,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color.White,
                                maxLines = 1,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { selectedDoc = null },
                                modifier = Modifier.size(24.dp)
                            ) {
                                Text("✕", color = Color.White, fontSize = 12.sp)
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = doc.clusterName ?: "General Archive",
                            fontSize = 11.sp,
                            color = Color(0xFF06B6D4),
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = doc.content.take(160) + if (doc.content.length > 160) "..." else "",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8),
                            lineHeight = 16.sp
                        )
                    }
                }
            }
        }
    }

    @Composable
    fun SearchQAScreenContent() {
        var query by remember { mutableStateOf("") }
        var searchResult by remember { mutableStateOf<QAAnswerResult?>(null) }
        var isSearching by remember { mutableStateOf(false) }
        var searchStageText by remember { mutableStateOf("") }

        val scannedDocs = DocumentStore.documents

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Ask a question about your files...") },
                modifier = Modifier.fillMaxWidth(),
                trailingIcon = {
                    IconButton(
                        onClick = {
                            if (query.isNotBlank()) {
                                isSearching = true
                                searchResult = null
                                CoroutineScope(Dispatchers.Main).launch {
                                    searchStageText = "🔍 Searching documents..."
                                    kotlinx.coroutines.delay(400)
                                    searchStageText = "🧠 Running MobileBERT QA..."
                                    kotlinx.coroutines.delay(450)
                                    searchStageText = "✨ Extracting answer..."
                                    
                                    val res = withContext(Dispatchers.IO) {
                                        QASearchEngine.askQuestion(this@MainActivity, query)
                                    }
                                    kotlinx.coroutines.delay(300)
                                    
                                    searchResult = res
                                    isSearching = false
                                }
                            }
                        }
                    ) {
                        Text("🔍", fontSize = 20.sp)
                    }
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = MaterialTheme.colorScheme.onBackground,
                    unfocusedTextColor = MaterialTheme.colorScheme.onBackground,
                    focusedBorderColor = MaterialTheme.colorScheme.secondary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.2f),
                    focusedLabelColor = MaterialTheme.colorScheme.secondary,
                    unfocusedLabelColor = Color(0xFF64748B)
                ),
                shape = RoundedCornerShape(8.dp)
            )

            if (isSearching) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(12.dp)),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.secondary,
                                strokeWidth = 2.dp
                            )
                            Text(
                                text = "🧠 COGNITO OFFLINE AI THINKING...",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = searchStageText,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }
            } else {
                searchResult?.let { result ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(12.dp)),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "OFFLINE AI ANSWER",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    "Score: ${result.score}",
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = result.answer,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            Spacer(Modifier.height(10.dp))
                            Text(
                                text = "Source: ${result.sourceDocumentName}",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF94A3B8)
                            )
                            Text(
                                text = "Path: ${result.sourceDocumentPath}",
                                fontSize = 8.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                }
            }

            Text(
                text = "SEARCH HITS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF94A3B8)
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val queryTerms = query.lowercase().split(Regex("\\W+")).filter { it.length > 2 }
                val matchedDocs = if (queryTerms.isEmpty()) emptyList() else scannedDocs.filter { doc ->
                    queryTerms.any { term -> doc.content.lowercase().contains(term) || doc.name.lowercase().contains(term) }
                }

                if (matchedDocs.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (query.isBlank()) "Type a question above to start searching." else "No documents matched your search keywords.",
                                fontSize = 13.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                } else {
                    items(matchedDocs) { doc ->
                        ScannedFileItem(doc)
                    }
                }
            }
        }
    }

    @Composable
    fun ScannedFileItem(doc: ScannedDocument) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = doc.extension.uppercase(),
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = doc.name,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "${doc.sizeBytes} bytes • ${doc.path}",
                        fontSize = 9.sp,
                        color = Color(0xFF64748B),
                        maxLines = 1
                    )
                }
            }
        }
    }

    @Composable
    fun AuthScreen(
        onLoginSuccess: () -> Unit
    ) {
        var isSignUpMode by remember { mutableStateOf(false) }
        var email by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var displayName by remember { mutableStateOf("") }
        var isLoading by remember { mutableStateOf(false) }
        var errorMessage by remember { mutableStateOf<String?>(null) }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.app_logo),
                contentDescription = "Cognito Logo",
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(16.dp))
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Cognito AI",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "Offline Document Search & Firebase Auth",
                fontSize = 12.sp,
                color = Color(0xFF94A3B8)
            )
            Spacer(Modifier.height(24.dp))

            // Tab Selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(4.dp)
            ) {
                Button(
                    onClick = { isSignUpMode = false; errorMessage = null },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (!isSignUpMode) MaterialTheme.colorScheme.primary else Color.Transparent,
                        contentColor = if (!isSignUpMode) Color.White else Color(0xFF94A3B8)
                    ),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Sign In", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
                Button(
                    onClick = { isSignUpMode = true; errorMessage = null },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isSignUpMode) MaterialTheme.colorScheme.primary else Color.Transparent,
                        contentColor = if (isSignUpMode) Color.White else Color(0xFF94A3B8)
                    ),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Create Account", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(16.dp))

            if (errorMessage != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFEF4444).copy(alpha = 0.15f))
                        .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = Color(0xFFFCA5A5),
                        fontSize = 12.sp
                    )
                }
                Spacer(Modifier.height(12.dp))
            }

            if (isSignUpMode) {
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("Full Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email Address") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password (min 6 chars)") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = {
                    isLoading = true
                    errorMessage = null
                    if (isSignUpMode) {
                        AuthManager.signUpWithEmail(email, password, displayName) { success, err ->
                            isLoading = false
                            if (success) {
                                onLoginSuccess()
                            } else {
                                errorMessage = err
                            }
                        }
                    } else {
                        AuthManager.signInWithEmail(email, password) { success, err ->
                            isLoading = false
                            if (success) {
                                onLoginSuccess()
                            } else {
                                errorMessage = err
                            }
                        }
                    }
                },
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = if (isSignUpMode) "Create Account" else "Sign In",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            OutlinedButton(
                onClick = {
                    isLoading = true
                    errorMessage = null
                    AuthManager.signInAnonymously { success, err ->
                        isLoading = false
                        if (success) {
                            onLoginSuccess()
                        } else {
                            errorMessage = err
                        }
                    }
                },
                enabled = !isLoading,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
            ) {
                Text(
                    text = "Continue as Guest",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
        }
    }

    @Composable
    fun PermissionGateScreen(
        onRequestPermissionClick: () -> Unit
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.app_logo),
                contentDescription = "Cognito Logo",
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(16.dp))
            )
            Spacer(Modifier.height(24.dp))
            Text(
                text = "File storage access required",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Cognito scans your local device files offline to answer your questions securely. We never transmit your files or queries to the internet.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                lineHeight = 18.sp
            )
            Spacer(Modifier.height(32.dp))
            Button(
                onClick = onRequestPermissionClick,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text(
                    text = "Authorize File Access",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }
        }
    }

    // ==========================================================================
    // Local Compose Material Theme definitions (Deep Obsidian & Indigo/Cyan)
    // ==========================================================================

    @Composable
    fun CognitoAppTheme(isDark: Boolean, content: @Composable () -> Unit) {
        val colors = if (isDark) {
            darkColorScheme(
                primary = Color(0xFF6366F1), // Indigo
                secondary = Color(0xFF06B6D4), // Cyan
                background = Color(0xFF060709), // Dark Base
                surface = Color(0xFF0C0E12), // Card Surface
                onPrimary = Color.White,
                onSecondary = Color.White,
                onBackground = Color.White,
                onSurface = Color.White
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF4F46E5), // Indigo Light
                secondary = Color(0xFF0891B2), // Cyan Light
                background = Color(0xFFF1F5F9), // Light Slate Base
                surface = Color.White, // White Card Surface
                onPrimary = Color.White,
                onSecondary = Color.White,
                onBackground = Color(0xFF0F172A), // Dark Slate Text
                onSurface = Color(0xFF1E293B)
            )
        }
        MaterialTheme(
            colorScheme = colors,
            content = content
        )
    }
}