export function generateDeploymentCode(result, req) {
  const { cloud, instance } = result;
  const { appType } = req;

  if (cloud === "aws") {
    return `# ── AWS Deployment ── CloudTwin Optimized ──
# Instance: ${instance} | $${result.monthlyCost}/mo

provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "cloudtwin_app" {
  ami           = "ami-0c02fb55956c7d316"  # Amazon Linux 2
  instance_type = "${instance}"

  tags = {
    Name        = "cloudtwin-${appType}-server"
    Environment = "production"
    ManagedBy   = "cloudtwin"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  vpc_security_group_ids = [aws_security_group.app_sg.id]
}

resource "aws_security_group" "app_sg" {
  name = "cloudtwin-sg"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Auto Scaling (optional)
resource "aws_autoscaling_group" "app_asg" {
  max_size         = 3
  min_size         = 1
  desired_capacity = 1
  launch_template {
    id      = aws_launch_template.app_lt.id
    version = "$Latest"
  }
}

output "instance_ip" {
  value = aws_instance.cloudtwin_app.public_ip
}`;
  }

  if (cloud === "gcp") {
    return `# ── GCP Deployment ── CloudTwin Optimized ──
# Instance: ${instance} | $${result.monthlyCost}/mo

provider "google" {
  project = "YOUR_PROJECT_ID"
  region  = "us-central1"
  zone    = "us-central1-a"
}

resource "google_compute_instance" "cloudtwin_app" {
  name         = "cloudtwin-${appType}-server"
  machine_type = "${instance}"
  zone         = "us-central1-a"

  tags = ["cloudtwin", "${appType}"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
      size  = 20
      type  = "pd-ssd"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y nginx
    systemctl start nginx
  EOF

  labels = {
    environment = "production"
    managed_by  = "cloudtwin"
  }
}

resource "google_compute_firewall" "app_firewall" {
  name    = "cloudtwin-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  source_ranges = ["0.0.0.0/0"]
}

output "instance_ip" {
  value = google_compute_instance.cloudtwin_app.network_interface[0].access_config[0].nat_ip
}`;
  }

  return `# ── Azure Deployment ── CloudTwin Optimized ──
# Instance: ${instance} | $${result.monthlyCost}/mo

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "cloudtwin_rg" {
  name     = "cloudtwin-rg"
  location = "East US"
}

resource "azurerm_virtual_machine" "cloudtwin_app" {
  name                  = "cloudtwin-${appType}-vm"
  location              = azurerm_resource_group.cloudtwin_rg.location
  resource_group_name   = azurerm_resource_group.cloudtwin_rg.name
  vm_size               = "${instance}"
  network_interface_ids = [azurerm_network_interface.app_nic.id]

  storage_os_disk {
    name              = "cloudtwin-osdisk"
    caching           = "ReadWrite"
    create_option     = "FromImage"
    managed_disk_type = "Premium_LRS"
  }

  storage_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "18.04-LTS"
    version   = "latest"
  }

  os_profile {
    computer_name  = "cloudtwin-vm"
    admin_username = "azureuser"
  }

  tags = {
    Environment = "production"
    ManagedBy   = "cloudtwin"
  }
}

output "public_ip" {
  value = azurerm_public_ip.app_pip.ip_address
}`;
}
